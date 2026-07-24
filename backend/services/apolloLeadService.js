const Contact = require("../models/Contact");
const Campaign = require("../models/Campaign");

function normalizeLinkedin(value = "") {
  return String(value).trim().toLowerCase().replace(/\/$/, "");
}

function normalizeLead(lead = {}) {
  const email = String(lead.email || "").trim().toLowerCase();
  const linkedin = normalizeLinkedin(lead.linkedinUrl || lead.linkedin);
  const providerContactId = String(
    lead.apolloPersonId || lead.apolloContactId || lead.providerContactId || "",
  ).trim();

  return {
    name: String(lead.name || `${lead.firstName || ""} ${lead.lastName || ""}`).trim(),
    firstName: String(lead.firstName || "").trim(),
    lastName: String(lead.lastName || "").trim(),
    email,
    company: String(lead.company || lead.organizationName || "").trim(),
    title: String(lead.title || "").trim(),
    industry: String(lead.industry || "").trim(),
    city: String(lead.city || "").trim(),
    state: String(lead.state || "").trim(),
    country: String(lead.country || "").trim(),
    employeeCount: Number.isFinite(Number(lead.employeeCount)) ? Number(lead.employeeCount) : null,
    linkedin,
    sourceProvider: "apollo",
    providerContactId: providerContactId || undefined,
    providerRecordId: String(lead.apolloRecordId || "").trim() || undefined,
  };
}

async function importApolloLeads({ campaignId, leads }) {
  if (!Array.isArray(leads) || leads.length === 0 || leads.length > 100) {
    throw new Error("Select between 1 and 100 Apollo leads to import");
  }

  const campaign = await Campaign.findById(campaignId).select("_id");
  if (!campaign) throw new Error("Campaign not found");

  const result = { requested: leads.length, imported: 0, skipped: 0, failed: 0, errors: [] };
  for (let index = 0; index < leads.length; index += 1) {
    const lead = normalizeLead(leads[index]);
    if (!lead.name || (!lead.providerContactId && !lead.email && !lead.linkedin)) {
      result.failed += 1;
      result.errors.push({ index, message: "Lead requires a name and provider ID, email, or LinkedIn URL" });
      continue;
    }

    const identifiers = [];
    if (lead.providerContactId) identifiers.push({ sourceProvider: "apollo", providerContactId: lead.providerContactId });
    if (lead.email) identifiers.push({ email: lead.email });
    if (lead.linkedin) identifiers.push({ linkedin: lead.linkedin });
    const existing = await Contact.findOne({ $or: identifiers });
    if (existing) {
      await Contact.updateOne({ _id: existing._id }, { $addToSet: { campaignIds: campaign._id } });
      result.skipped += 1;
      continue;
    }

    try {
      await Contact.create({
        ...lead,
        sources: ["apollo"],
        externalIds: lead.providerContactId ? { apollo: lead.providerContactId } : {},
        tags: ["apollo"],
        type: "lead",
        status: "active",
        campaignIds: [campaign._id],
        importedAt: new Date(),
      });
      result.imported += 1;
    } catch (error) {
      if (error?.code === 11000) result.skipped += 1;
      else {
        result.failed += 1;
        result.errors.push({ index, message: "Unable to import lead" });
      }
    }
  }
  return result;
}

module.exports = { normalizeLead, importApolloLeads };
