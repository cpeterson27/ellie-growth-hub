/**
 * Facebook Social Integration Adapter
 * Handles page and group management via Facebook Graph API
 */

const BaseIntegration = require("../BaseIntegration");

class FacebookAdapter extends BaseIntegration {
  constructor(config = {}) {
    super("Facebook", "social", config);
    this.baseUrl = "https://graph.facebook.com";
    this.capabilities = [
      "post_to_page",
      "post_to_group",
      "get_page_insights",
      "manage_comments",
    ];
  }

  getVersion() {
    return "16.0.0"; // Facebook Graph API version
  }

  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Verify Facebook connection
   */
  async verify() {
    const error = "Meta customer OAuth and Graph API verification are not implemented.";
    this.authenticated = false;
    this.setError(error);
    return { success: false, available: false, error };
  }

  /**
   * Post to page
   * @param {Object} params { pageId, message, imageUrl, link }
   * @returns {Promise<Object>}
   */
  async postToPage(params) {
    void params;
    throw new Error("Facebook publishing is unavailable until customer OAuth and the real Graph API are implemented.");
  }
}

module.exports = FacebookAdapter;
