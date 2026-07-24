const BaseIntegration = require("./BaseIntegration");
const { searchContacts } = require("../../services/apollo");

class ApolloAdapter extends BaseIntegration {
  constructor() {
    super("Apollo", "lead_provider");
  }

  getCapabilities() {
    return ["searchLeads", "normalizeContacts"];
  }

  async searchLeads(filters) {
    return searchContacts(filters);
  }
}

module.exports = ApolloAdapter;
