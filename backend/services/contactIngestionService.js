const Contact = require("../models/Contact");
const Campaign = require("../models/Campaign");
const integrationHub = require("./integrationHub");
const mondaySyncService = require("./mondaySyncService");

const canonicalFieldMap = Object.fromEntries([
  ["First Name", "firstName"], ["Last Name", "lastName"], ["Title", "title"],
  ["Company Name", "company"], ["Company Name for Emails", "companyNameForEmails"],
  ["Email", "email"], ["Email Status", "emailStatus"], ["Work Direct Phone", "phone"],
  ["Corporate Phone", "corporatePhone"], ["Mobile Phone", "mobilePhone"],
  ["Home Phone", "homePhone"], ["Person Linkedin Url", "linkedin"], ["Website", "website"],
  ["Industry", "industry"], ["City", "city"], ["State", "state"], ["Country", "country"],
  ["# Employees", "employeeCount"], ["Seniority", "seniority"], ["Departments", "departments"],
  ["Sub Departments", "subDepartments"], ["Lists", "lists"], ["Keywords", "keywords"],
  ["Technologies", "technologies"], ["SIC Codes", "sicCodes"], ["NAICS Codes", "naicsCodes"],
  ["Annual Revenue", "annualRevenue"], ["Total Funding", "totalFunding"],
  ["Latest Funding Amount", "latestFundingAmount"], ["Last Raised At", "lastRaisedAt"],
  ["Last Contacted", "lastContacted"], ["Stage", "stage"], ["Do Not Call", "doNotCall"],
  ["Apollo Contact Id", "apolloContactId"], ["Apollo Account Id", "apolloAccountId"],
  ["Apollo Record Id", "apolloRecordId"], ["Secondary Email", "secondaryEmail"],
  ["Tertiary Email", "tertiaryEmail"], ["Email Open", "emailOpen"],
  ["Email Bounced", "emailBounced"], ["Replied", "replied"], ["Demoed", "demoed"],
  ["Number of Retail Locations", "retailLocations"],
]);

const arrayFields = new Set(["departments", "subDepartments", "lists", "keywords", "technologies", "sicCodes", "naicsCodes"]);
const booleanFields = new Set(["doNotCall", "emailOpen", "emailBounced", "replied", "demoed"]);
const numberFields = new Set(["employeeCount", "annualRevenue", "totalFunding", "latestFundingAmount", "retailLocations"]);
const dateFields = new Set(["lastRaisedAt", "lastContacted"]);

function normalizeUrl(value = "") { return String(value).trim().toLowerCase().replace(/\/$/, ""); }
function truthy(value) { return ["true", "yes", "1"].includes(String(value).trim().toLowerCase()); }
function split(value) { return Array.isArray(value) ? value : String(value || "").split(/[;,|]/).map((item) => item.trim()).filter(Boolean); }

function normalizeIncoming(row, source = "manual") {
  const mapped = {};
  const apolloFields = {};
  for (const [key, value] of Object.entries(row || {})) {
    const field = canonicalFieldMap[key] || key;
    mapped[field] = value;
    if (canonicalFieldMap[key]) apolloFields[field] = value;
  }
  for (const field of arrayFields) if (mapped[field] !== undefined) mapped[field] = split(mapped[field]);
  for (const field of booleanFields) if (mapped[field] !== undefined) mapped[field] = truthy(mapped[field]);
  for (const field of numberFields) if (mapped[field] !== undefined) mapped[field] = Number(mapped[field]) || null;
  for (const field of dateFields) if (mapped[field]) mapped[field] = new Date(mapped[field]);
  mapped.email = String(mapped.email || "").trim().toLowerCase();
  mapped.linkedin = normalizeUrl(mapped.linkedin || mapped.linkedinUrl);
  mapped.name = String(mapped.name || `${mapped.firstName || ""} ${mapped.lastName || ""}`).trim();
  mapped.sourceProvider = source === "apollo" ? "apollo" : mapped.sourceProvider || source;
  mapped.providerContactId = String(mapped.apolloContactId || mapped.apolloPersonId || mapped.providerContactId || "").trim() || undefined;
  mapped.providerRecordId = String(mapped.apolloRecordId || mapped.providerRecordId || "").trim() || undefined;
  mapped.apolloFields = { ...(mapped.apolloFields || {}), ...apolloFields, ...Object.fromEntries(Object.entries(mapped).filter(([key]) => !["apolloFields", "name"].includes(key))) };
  return mapped;
}

async function ingestContacts({ contacts, source = "manual", campaignId = null, syncMonday = true }) {
  if (!Array.isArray(contacts) || !contacts.length || contacts.length > 500) throw new Error("Provide between 1 and 500 contacts");
  let campaign = null;
  if (campaignId) { campaign = await Campaign.findById(campaignId).select("_id name"); if (!campaign) throw new Error("Campaign not found"); }
  const summary = { requested: contacts.length, mongoCreated: 0, mongoUpdated: 0, mongoSkipped: 0, mondayCreated: 0, mondayUpdated: 0, mondaySkipped: 0, mondayFailed: 0, campaignAssociated: 0, failed: 0, errors: [], missingMondayMappings: [] };
  for (let index = 0; index < contacts.length; index += 1) {
    const data = normalizeIncoming(contacts[index], source);
    if (!data.name) { summary.failed += 1; summary.errors.push({ index, message: "Name is required" }); continue; }
    const keys = [];
    if (data.providerContactId) keys.push({ sourceProvider: data.sourceProvider, providerContactId: data.providerContactId });
    if (data.email) keys.push({ email: data.email }); if (data.linkedin) keys.push({ linkedin: data.linkedin });
    if (data.mondayItemId) keys.push({ mondayItemId: data.mondayItemId }); if (data.phone) keys.push({ phone: data.phone });
    if (!keys.length && data.company) keys.push({ name: data.name, company: data.company });
    let contact = keys.length ? await Contact.findOne({ $or: keys }) : null;
    if (contact) {
      Object.entries(data).forEach(([key, value]) => {
        if (key === "apolloFields") contact.apolloFields = { ...(contact.apolloFields || {}), ...(value || {}) };
        else if (value !== undefined && value !== "" && value !== null) contact[key] = value;
      });
      if (!contact.sources.includes(source)) contact.sources.push(source);
      summary.mongoUpdated += 1;
    }
    else { contact = new Contact({ ...data, sources: [source], tags: [source], type: "lead", status: "active", importedAt: new Date() }); summary.mongoCreated += 1; }
    if (campaign && !contact.campaignIds.some((id) => String(id) === String(campaign._id))) { contact.campaignIds.push(campaign._id); summary.campaignAssociated += 1; }
    await contact.save();
    if (!syncMonday || source === "monday") { summary.mondaySkipped += 1; continue; }
    try {
      const credentials = await mondaySyncService.getMondayCredentials();
      if (!credentials?.apiKey) throw new Error("not_configured");
      if (!contact.mondayItemId) {
        const existingItem = await integrationHub.execute("monday", "findExistingContact", credentials, contact.toObject());
        if (existingItem?.id) contact.mondayItemId = String(existingItem.id);
      }
      const operation = contact.mondayItemId ? "updateContact" : "createContact";
      const result = await integrationHub.execute("monday", operation, credentials, { ...contact.toObject(), campaignName: campaign?.name || "" });
      contact.mondayItemId = String(result.id || contact.mondayItemId || ""); contact.mondaySyncStatus = "synced"; contact.mondaySyncedAt = new Date(); contact.mondaySyncError = "";
      if (Array.isArray(result.missingMappings)) summary.missingMondayMappings.push(...result.missingMappings);
      await contact.save();
      if (operation === "createContact") summary.mondayCreated += 1; else summary.mondayUpdated += 1;
    } catch (err) { contact.mondaySyncStatus = "failed"; contact.mondaySyncError = String(err.message || "Sync failed").slice(0, 300); await contact.save(); summary.mondayFailed += 1; }
  }
  summary.missingMondayMappings = [...new Set(summary.missingMondayMappings)];
  return summary;
}

async function retryMondaySync(contactId) {
  const contact = await Contact.findById(contactId);
  if (!contact) throw new Error("Contact not found");
  const credentials = await mondaySyncService.getMondayCredentials();
  if (!credentials?.apiKey) throw new Error("Monday CRM is not configured");
  try {
    const operation = contact.mondayItemId ? "updateContact" : "createContact";
    const result = await integrationHub.execute("monday", operation, credentials, contact.toObject());
    contact.mondayItemId = String(result.id || contact.mondayItemId || "");
    contact.mondaySyncStatus = "synced";
    contact.mondaySyncedAt = new Date();
    contact.mondaySyncError = "";
    await contact.save();
    return { contact, operation, missingMappings: result.missingMappings || [] };
  } catch (err) {
    contact.mondaySyncStatus = "failed";
    contact.mondaySyncError = String(err.message || "Sync failed").slice(0, 300);
    await contact.save();
    throw err;
  }
}

module.exports = { canonicalFieldMap, normalizeIncoming, ingestContacts, retryMondaySync };
