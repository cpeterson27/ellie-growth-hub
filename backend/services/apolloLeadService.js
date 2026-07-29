const { ingestContacts, normalizeIncoming } = require("./contactIngestionService");
const { enrichContacts } = require("./apollo");

function normalizeLead(lead = {}) {
  return normalizeIncoming({ ...lead, apolloContactId: lead.apolloContactId || lead.apolloPersonId }, "apollo");
}

async function importApolloLeads({ campaignId, leads }) {
  if (!campaignId) throw new Error("Campaign is required to import Apollo leads");
  if (!Array.isArray(leads) || !leads.length) throw new Error("Select at least one Apollo contact to import");
  let contacts = leads;
  if (leads.some((lead) => !lead.email && (lead.apolloPersonId || lead.apolloContactId))) {
    try {
      contacts = await enrichContacts(leads);
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) throw new Error("Apollo email enrichment is not available for the configured API key or plan.");
      if (status === 429) throw new Error("Apollo could not enrich these contacts because the account reached a credit or rate limit.");
      throw error;
    }
  }
  return ingestContacts({ contacts, source: "apollo", campaignId });
}

module.exports = { normalizeLead, importApolloLeads };
