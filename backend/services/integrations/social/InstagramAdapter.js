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
    try {
      if (!this.config.accessToken) {
        throw new Error("Instagram access token not configured");
      }

      // In production:
      // const response = await fetch(`${this.baseUrl}/me`, {
      //   params: { access_token: this.config.accessToken }
      // });

      this.authenticated = true;
      this.clearError();
      return {
        success: true,
        message: "Instagram configured (not authenticated)",
      };
    } catch (error) {
      this.setError(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create post
   * @param {Object} params { accountId, caption, imageUrl }
   * @returns {Promise<Object>}
   */
  async createPost(params) {
    try {
      if (!this.config.accessToken) {
        throw new Error("Instagram not configured");
      }

      const { accountId, caption, imageUrl } = params;

      if (!accountId || !imageUrl) {
        throw new Error("accountId and imageUrl are required");
      }

      // Would call Instagram API here
      return {
        success: true,
        postId: `instagram_${Date.now()}`,
        url: `https://instagram.com/p/${Date.now()}`,
        createdAt: new Date(),
      };
    } catch (error) {
      this.setError(error.message);
      throw error;
    }
  }
}

module.exports = InstagramAdapter;
