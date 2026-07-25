const TARGETING_FIELDS = ["company", "title", "industry"];

function getMissingTargetingFields(contact = {}) {
  return TARGETING_FIELDS.filter((field) => !String(contact[field] || "").trim());
}

function applyResearchClassification(contact) {
  const missingFields = getMissingTargetingFields(contact);
  contact.missingFields = missingFields;

  const tags = new Set(Array.isArray(contact.tags) ? contact.tags.filter(Boolean) : []);
  if (missingFields.length) {
    contact.researchStatus = "needs_research";
    tags.add("needs-research");
    if (!contact.stage || contact.stage === "Ready for Review") contact.stage = "Needs Research";
    contact.qualifyContact = false;
  } else {
    tags.delete("needs-research");
    contact.researchStatus = contact.qualifyContact ? "qualified" : "ready_for_review";
    if (!contact.stage || contact.stage === "Needs Research") contact.stage = contact.qualifyContact ? "Qualified" : "Ready for Review";
  }
  contact.tags = [...tags];
  return contact;
}

module.exports = {
  TARGETING_FIELDS,
  applyResearchClassification,
  getMissingTargetingFields,
};
