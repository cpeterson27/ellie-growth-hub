const Contact = require("../models/Contact");
const Campaign = require("../models/Campaign");
const { applyResearchClassification } = require("./contactResearchService");

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
  ["Primary Email Source", "primaryEmailSource"], ["Primary Email Verification Source", "primaryEmailVerificationSource"], ["Email Confidence", "emailConfidence"],
  ["Primary Email Catch-all Status", "primaryEmailCatchAllStatus"], ["Primary Email Last Verified At", "primaryEmailLastVerifiedAt"], ["Subsidiary Of", "subsidiaryOf"], ["Subsidiary Organization ID", "subsidiaryOrganizationId"], ["Email Sent", "emailSent"],
  ["Contact Owner", "contactOwner"], ["Other Phone", "otherPhone"], ["Account Owner", "accountOwner"],
  ["Company LinkedIn URL", "companyLinkedinUrl"], ["Facebook URL", "facebookUrl"], ["Twitter URL", "twitterUrl"],
  ["Company Address", "companyAddress"], ["Company City", "companyCity"], ["Company State", "companyState"], ["Company Country", "companyCountry"], ["Company Phone", "companyPhone"],
  ["Latest Funding", "latestFunding"], ["Apollo Account ID", "apolloAccountId"], ["Secondary Email Status", "secondaryEmailStatus"], ["Tertiary Email Status", "tertiaryEmailStatus"], ["Qualify Contact", "qualifyContact"],
  ["Name", "name"], ["Phone", "phone"], ["LinkedIn", "linkedin"], ["Notes", "notes"], ["Tags", "tags"], ["Audience Profiles", "audienceProfiles"],
  ["Apollo Contact ID", "apolloContactId"], ["Apollo Record ID", "apolloRecordId"], ["Secondary Email Source", "secondaryEmailSource"], ["Secondary Email Verification Source", "secondaryEmailVerificationSource"], ["Tertiary Email Source", "tertiaryEmailSource"], ["Tertiary Email Verification Source", "tertiaryEmailVerificationSource"],
]);

const arrayFields = new Set(["departments", "subDepartments", "lists", "keywords", "technologies", "sicCodes", "naicsCodes", "tags", "audienceProfiles"]);
const booleanFields = new Set(["doNotCall", "emailSent", "emailOpen", "emailBounced", "replied", "demoed", "qualifyContact"]);
const numberFields = new Set(["employeeCount", "annualRevenue", "totalFunding", "latestFundingAmount", "retailLocations"]);
const dateFields = new Set(["lastRaisedAt", "lastContacted", "primaryEmailLastVerifiedAt"]);

function normalizeUrl(value = "") { return String(value).trim().toLowerCase().replace(/\/$/, ""); }
function truthy(value) { return ["true", "yes", "1"].includes(String(value).trim().toLowerCase()); }
function split(value) { return Array.isArray(value) ? value : String(value || "").split(/[;,|]/).map((item) => item.trim()).filter(Boolean); }
function cleanPlaceholder(field, value) {
  const text = String(value || "").trim();
  if (["phone", "workDirectPhone", "corporatePhone", "mobilePhone", "homePhone", "otherPhone"].includes(field)
    && /^(request phone number|phone unavailable|not available|n\/a|-)$/i.test(text)) return "";
  if (field === "title" && /^[+()\d\s.-]{7,}$/.test(text) && text.replace(/\D/g, "").length >= 7) return "";
  if (text.toLowerCase() !== "stage = needs research") return value;
  if (field === "stage") return "Needs Research";
  if (field === "qualifyContact") return false;
  if (field === "tags") return ["needs-research"];
  return "";
}

function normalizeIncoming(row, source = "manual") {
  const mapped = {};
  const additionalFields = {};
  for (const [key, value] of Object.entries(row || {})) {
    const cleanKey = String(key).replace(/^\uFEFF/, "").trim();
    const known = canonicalFieldMap[cleanKey];
    const field = known || cleanKey;
    mapped[field] = cleanPlaceholder(field, value);
    if (!known && !["name", "email", "phone", "company", "title", "linkedin", "tags", "sourceProvider", "mondayItemId"].includes(field)) additionalFields[cleanKey] = value;
  }
  for (const field of arrayFields) if (mapped[field] !== undefined) mapped[field] = split(mapped[field]);
  for (const field of booleanFields) if (mapped[field] !== undefined) mapped[field] = truthy(mapped[field]);
  for (const field of numberFields) if (mapped[field] !== undefined) mapped[field] = Number(mapped[field]) || null;
  for (const field of dateFields) if (mapped[field]) mapped[field] = new Date(mapped[field]);
  mapped.email = String(mapped.email || "").trim().toLowerCase();
  if (!mapped.email) delete mapped.email;
  const manuallyConfirmedEmail = source === "manual"
    && Boolean(mapped.email)
    && truthy(mapped.confirmEmailManually);
  delete mapped.confirmEmailManually;
  if (manuallyConfirmedEmail) {
    mapped.emailStatus = "verified";
    mapped.primaryEmailVerificationSource = "owner_confirmation";
    mapped.emailConfidence = "personally_confirmed";
    mapped.primaryEmailLastVerifiedAt = new Date();
  }
  mapped.linkedin = normalizeUrl(mapped.linkedin || mapped.linkedinUrl);
  if (!mapped.title && mapped.seniority && !/^[+()\d\s.-]{7,}$/.test(String(mapped.seniority))) mapped.title = mapped.seniority;
  mapped.name = String(mapped.name || `${mapped.firstName || ""} ${mapped.lastName || ""}`).trim();
  mapped.sourceProvider = source === "apollo" ? "apollo" : mapped.sourceProvider || source;
  mapped.providerContactId = String(mapped.apolloContactId || mapped.apolloPersonId || mapped.providerContactId || "").trim() || undefined;
  mapped.providerRecordId = String(mapped.apolloRecordId || mapped.providerRecordId || "").trim() || undefined;
  mapped.additionalFields = { ...(mapped.additionalFields || {}), ...additionalFields };
  return mapped;
}

async function ingestContacts({
  contacts,
  source = "manual",
  campaignId = null,
  marketingPermission = false,
  importBatchId = "",
  importFileName = "",
}) {
  if (!Array.isArray(contacts) || !contacts.length || contacts.length > 500) throw new Error("Provide between 1 and 500 contacts");
  const cleanBatchId = String(importBatchId || "").trim().slice(0, 100);
  const cleanFileName = String(importFileName || "").trim().slice(0, 200);
  const importedNow = new Date();
  let campaign = null;
  if (campaignId) { campaign = await Campaign.findById(campaignId).select("_id name"); if (!campaign) throw new Error("Campaign not found"); }
  const summary = {
    requested: contacts.length,
    mongoCreated: 0,
    mongoUpdated: 0,
    mongoSkipped: 0,
    campaignAssociated: 0,
    failed: 0,
    errors: [],
    importBatchId: cleanBatchId || null,
    importFileName: cleanFileName || null,
    campaignName: campaign?.name || null,
  };
  for (let index = 0; index < contacts.length; index += 1) {
    const data = normalizeIncoming(contacts[index], source);
    if (!data.name) { summary.failed += 1; summary.errors.push({ index, message: "Name is required" }); continue; }
    const keys = [];
    if (data.providerContactId) keys.push({ sourceProvider: data.sourceProvider, providerContactId: data.providerContactId });
    if (data.email) keys.push({ email: data.email }); if (data.linkedin) keys.push({ linkedin: data.linkedin });
    if (data.mondayItemId) keys.push({ mondayItemId: data.mondayItemId }); if (data.phone) keys.push({ phone: data.phone });
    if (!keys.length && data.company) keys.push({ name: data.name, company: data.company });
    let contact = keys.length ? await Contact.findOne({ $or: keys }) : null;
    const contactExisted = Boolean(contact);
    if (contact) {
      Object.entries(data).forEach(([key, value]) => {
        if (key === "apolloFields") contact.apolloFields = { ...(contact.apolloFields || {}), ...(value || {}) };
        else if (arrayFields.has(key) && Array.isArray(value)) contact[key] = [...new Set([...(contact[key] || []), ...value])];
        else if (value !== undefined && value !== "" && value !== null) contact[key] = value;
      });
      if (!contact.sources.includes(source)) contact.sources.push(source);
    }
    else {
      contact = new Contact({
        ...data,
        sources: [source],
        tags: [...new Set([source, ...(data.tags || [])])],
        type: "lead",
        // Imported contacts already belong to the business's CRM. Only leads
        // originating from an actual discovery workflow wait in Discovery.
        status: ["discovery", "apollo_search"].includes(source) ? "prospect" : "active",
        importedAt: new Date(),
      });
    }
    applyResearchClassification(contact);
    if (cleanBatchId) {
      contact.lastImportBatchId = cleanBatchId;
      contact.lastImportFileName = cleanFileName;
      contact.lastImportedAt = importedNow;
    }
    if (marketingPermission === true && contact.email) {
      contact.status = "active";
      contact.emailPreferences.marketingStatus = "subscribed";
      contact.emailPreferences.consentSource = `${source}_owner_confirmed`;
      contact.emailPreferences.consentAt = new Date();
      contact.emailPreferences.unsubscribedAt = null;
      contact.emailPreferences.unsubscribeSource = "";
      contact.emailPreferences.topics = {
        eventInvitations: true,
        programOffers: true,
        educationalNewsletter: true,
      };
    }
    if (campaign && !contact.campaignIds.some((id) => String(id) === String(campaign._id))) { contact.campaignIds.push(campaign._id); summary.campaignAssociated += 1; }
    try {
      await contact.save();
      if (contactExisted) summary.mongoUpdated += 1;
      else summary.mongoCreated += 1;
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ index, message: error.message || "Unable to save contact" });
    }
  }
  return summary;
}

module.exports = { canonicalFieldMap, normalizeIncoming, ingestContacts };
