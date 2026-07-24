const { ingestContacts, normalizeIncoming } = require("./contactIngestionService");

function normalizeLead(lead = {}) {
  return normalizeIncoming({ ...lead, apolloContactId: lead.apolloContactId || lead.apolloPersonId }, "apollo");
}

async function importApolloLeads({ campaignId, leads }) {
  if (!campaignId) throw new Error("Campaign is required to import Apollo leads");
  return ingestContacts({ contacts: leads, source: "apollo", campaignId });
}

module.exports = { normalizeLead, importApolloLeads };
