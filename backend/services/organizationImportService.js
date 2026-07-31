const Organization = require("../models/Organization");
const Audience = require("../models/Audience");
const DiscoveryRun = require("../models/DiscoveryRun");
const { scoreOrganization } = require("./audience");
const organizationRelationshipService = require("./organizationRelationship");

const FIELD_ALIASES = {
  name: "name", company: "name", "company name": "name", organization: "name", "organization name": "name", "account name": "name",
  domain: "domain", website: "website", "company website": "website", industry: "industry", industries: "industry",
  employees: "employeeCount", "# employees": "employeeCount", "number of employees": "employeeCount", "company employees": "employeeCount",
  location: "location", "company location": "location", headquarters: "location", "headquarters location": "location",
  linkedin: "linkedinUrl", "linkedin url": "linkedinUrl", "company linkedin url": "linkedinUrl",
  phone: "phone", "company phone": "phone", founded: "founded", "founded year": "founded", keywords: "keywords", description: "description",
  "apollo account id": "apolloId", "apollo organization id": "apolloId", "organization id": "apolloId", "account id": "apolloId",
};

function split(value) {
  return Array.isArray(value) ? value : String(value || "").split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

function domainFrom(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  try { return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "") || null; }
  catch { return raw.replace(/^www\./, "").split("/")[0] || null; }
}

function normalizeOrganizationRow(row = {}) {
  const data = {};
  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = String(key).replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
    const field = FIELD_ALIASES[cleanKey.toLowerCase()] || cleanKey;
    data[field] = typeof value === "string" ? value.trim() : value;
  });
  data.name = String(data.name || "").trim();
  data.website = String(data.website || "").trim();
  data.domain = domainFrom(data.domain || data.website);
  data.apolloId = String(data.apolloId || "").trim() || null;
  data.employeeCount = Number(String(data.employeeCount || "").replace(/,/g, "")) || null;
  data.founded = Number(data.founded) || null;
  data.keywords = split(data.keywords);
  return data;
}

function matchFilter(data) {
  if (data.domain) return { domain: data.domain };
  if (data.apolloId) return { apolloId: data.apolloId };
  return { name: data.name };
}

async function previewOrganizationImport(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error("Paste between 1 and 500 organizations");
  const seen = new Map();
  const preview = [];
  for (let index = 0; index < rows.length; index += 1) {
    const data = normalizeOrganizationRow(rows[index]);
    if (!data.name) { preview.push({ index, rowNumber: index + 2, status: "invalid", name: "", reason: "Company name is required" }); continue; }
    const signature = data.domain ? `domain:${data.domain}` : data.apolloId ? `apollo:${data.apolloId}` : `name:${data.name.toLowerCase()}`;
    if (seen.has(signature)) { preview.push({ index, rowNumber: index + 2, status: "file_duplicate", name: data.name, domain: data.domain || "", duplicateOfRow: seen.get(signature) + 2 }); continue; }
    seen.set(signature, index);
    const existing = await Organization.findOne(matchFilter(data)).select("_id name domain website").lean();
    preview.push({ index, rowNumber: index + 2, status: existing ? "existing" : "new", name: data.name, domain: data.domain || "", website: data.website || "", existingOrganization: existing ? { id: existing._id, name: existing.name, domain: existing.domain || "" } : null });
  }
  return {
    total: preview.length,
    newOrganizations: preview.filter((row) => row.status === "new").length,
    existingOrganizations: preview.filter((row) => row.status === "existing").length,
    duplicatesInFile: preview.filter((row) => row.status === "file_duplicate").length,
    invalidRows: preview.filter((row) => row.status === "invalid").length,
    rows: preview,
  };
}

async function importOrganizations({ rows, name = "" }) {
  const preview = await previewOrganizationImport(rows);
  const now = new Date();
  const organizationIds = [];
  let created = 0; let updated = 0; let failed = 0;
  const importedSignatures = new Set();
  for (const raw of rows) {
    const data = normalizeOrganizationRow(raw);
    if (!data.name) { failed += 1; continue; }
    const signature = data.domain ? `domain:${data.domain}` : data.apolloId ? `apollo:${data.apolloId}` : `name:${data.name.toLowerCase()}`;
    if (importedSignatures.has(signature)) continue;
    importedSignatures.add(signature);
    const filter = matchFilter(data);
    const existing = await Organization.findOne(filter);
    const { score, tier, reasons } = scoreOrganization(data);
    const doc = {
      name: data.name, domain: data.domain, source: "apollo", apolloId: data.apolloId,
      externalSources: { apollo: { id: data.apolloId, enrichedAt: null } },
      website: data.website || "", industry: data.industry || "", description: data.description || "",
      employeeCount: data.employeeCount, location: data.location || "", linkedinUrl: data.linkedinUrl || "",
      founded: data.founded, phone: data.phone || "", keywords: data.keywords,
      audienceScore: score, audienceTier: tier, scoreReasons: reasons,
      priorityScore: score, discoveredAt: existing?.discoveredAt || now,
    };
    try {
      const saved = await Organization.findOneAndUpdate(filter, { $set: doc }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
      organizationIds.push(saved._id);
      if (existing) updated += 1; else created += 1;
    } catch { failed += 1; }
  }
  const audience = await Audience.create({
    name: String(name || `Apollo organization import · ${now.toLocaleDateString("en-US")}`).trim().slice(0, 160),
    description: "Organizations pasted from Apollo and reviewed in Ellie.", status: "draft", source: "import",
    organizationIds, totalOrgs: organizationIds.length, lastDiscoveredAt: now,
  });
  await DiscoveryRun.create({
    audienceId: audience._id, status: failed ? "partial" : "success", organizationIds,
    statistics: { organizationsFound: organizationIds.length, organizationsCreated: created, organizationsUpdated: updated, duplicatesSkipped: preview.duplicatesInFile, persistenceFailed: failed },
    scoreDistribution: {}, startedAt: now, completedAt: new Date(),
  });
  const relationshipStats = await organizationRelationshipService.bulkCreateRelationships(organizationIds, audience._id);
  return { audienceId: audience._id, created, updated, failed, duplicatesSkipped: preview.duplicatesInFile, organizationsImported: organizationIds.length, relationshipsCreated: relationshipStats.created };
}

module.exports = { normalizeOrganizationRow, previewOrganizationImport, importOrganizations };
