/**
 * Instagram Social Integration Adapter
 * Handles content posting via Instagram Graph API (Business Account)
 */

const BaseIntegration = require("../BaseIntegration");

class InstagramAdapter extends BaseIntegration {
  constructor(config = {}) {
    super("Instagram", "social", config);
    this.baseUrl = "https://graph.instagram.com";
    this.capabilities = [
      "create_post",
      "create_carousel",
      "get_insights",
      "manage_comments",
    ];
  }

  getVersion() {
    return "16.0.0"; // Instagram Graph API version
  }

  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Verify Instagram connection
   */
  async verify() {
    const error = "Instagram customer OAuth and Graph API verification are not implemented.";
    this.authenticated = false;
    this.setError(error);
    return { success: false, available: false, error };
  }

  /**
   * Create post
   * @param {Object} params { accountId, caption, imageUrl }
   * @returns {Promise<Object>}
   */
  async createPost(params) {
    void params;
    throw new Error("Instagram publishing is unavailable until customer OAuth and the real Graph API are implemented.");
  }
}

module.exports = InstagramAdapter;
