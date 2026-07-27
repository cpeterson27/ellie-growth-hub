const TARGETING_FIELDS = ["company", "title", "industry"];

function getMissingTargetingFields(contact = {}) {
  return TARGETING_FIELDS.filter((field) => !String(contact[field] || "").trim());
}

function applyResearchClassification(contact) {
  const missingFields = getMissingTargetingFields(contact);
  contact.missingFields = missingFields;

  const tags = new Set(Array.isArray(contact.tags) ? contact.tags.filter(Boolean) : []);
  const hasUsableIdentity = Boolean(String(contact.name || "").trim() && String(contact.email || "").trim());
  const hasVerifiedEmail = contact.emailStatus === "verified";

  if (contact.qualifyContact && hasUsableIdentity && hasVerifiedEmail) {
    contact.researchStatus = "qualified";
    contact.stage = "Qualified";
    contact.status = "active";
    tags.delete("needs-research");
    if (missingFields.length) tags.add("needs-enrichment");
    else tags.delete("needs-enrichment");
  } else if (missingFields.length) {
    contact.researchStatus = "needs_research";
    tags.add("needs-research");
    contact.qualifyContact = false;
    if (!contact.stage || contact.stage === "Ready for Review") contact.stage = "Needs Research";
  } else {
    tags.delete("needs-research");
    tags.delete("needs-enrichment");
    contact.researchStatus = "ready_for_review";
    if (!contact.stage || contact.stage === "Needs Research") contact.stage = "Ready for Review";
    contact.qualifyContact = false;
  }
  contact.tags = [...tags];
  return contact;
}

module.exports = {
  TARGETING_FIELDS,
  applyResearchClassification,
  getMissingTargetingFields,
};
