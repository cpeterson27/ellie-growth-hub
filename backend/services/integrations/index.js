/**
 * Integration Registry & Factory
 * Manages all available integrations
 */

const ResendAdapter = require("./email/ResendAdapter");
const EventbriteAdapter = require("./EventbriteAdapter");
const MondayAdapter = require("./MondayAdapter");
const ApolloAdapter = require("./ApolloAdapter");
const MeetupAdapter = require("./events/MeetupAdapter");
const LinkedInAdapter = require("./social/LinkedInAdapter");
const FacebookAdapter = require("./social/FacebookAdapter");
const InstagramAdapter = require("./social/InstagramAdapter");
const XAdapter = require("./social/XAdapter");

class IntegrationRegistry {
  constructor() {
    this.integrations = new Map();
    this.registerDefaultIntegrations();
  }

  /**
   * Register default integrations from config
   * In production, load from environment variables
   */
  registerDefaultIntegrations() {
    // Email integrations
    this.register(
      "resend",
      new ResendAdapter({
        apiKey: process.env.RESEND_API_KEY || null,
      }),
    );

    // Event integrations
    this.register(
      "eventbrite",
      new EventbriteAdapter(),
    );

    this.register("monday", new MondayAdapter());
    this.register("apollo", new ApolloAdapter());

    this.register(
      "meetup",
      new MeetupAdapter({
        accessToken: process.env.MEETUP_ACCESS_TOKEN || null,
      }),
    );

    // Social integrations
    this.register(
      "linkedin",
      new LinkedInAdapter({
        accessToken: process.env.LINKEDIN_ACCESS_TOKEN || null,
      }),
    );

    this.register(
      "facebook",
      new FacebookAdapter({
        accessToken: process.env.FACEBOOK_ACCESS_TOKEN || null,
      }),
    );

    this.register(
      "instagram",
      new InstagramAdapter({
        accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || null,
      }),
    );

    this.register(
      "x",
      new XAdapter({
        bearerToken: process.env.X_BEARER_TOKEN || null,
      }),
    );
  }

  /**
   * Register integration
   * @param {String} key Integration identifier
   * @param {BaseIntegration} instance Adapter instance
   */
  register(key, instance) {
    this.integrations.set(key, instance);
  }

  /**
   * Get integration by key
   * @param {String} key
   * @returns {BaseIntegration|null}
   */
  get(key) {
    return this.integrations.get(key) || null;
  }

  /**
   * Get all integrations
   * @returns {Map<String, BaseIntegration>}
   */
  getAll() {
    return this.integrations;
  }

  /**
   * Get status of all integrations
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const status = {
      timestamp: new Date(),
      integrations: {},
      summary: {
        total: this.integrations.size,
        configured: 0,
        authenticated: 0,
        byType: {},
      },
    };

    for (const [key, integration] of this.integrations) {
      const integrationStatus = await integration.getStatus();
      status.integrations[key] = integrationStatus;

      // Update summary
      if (
        integration.config &&
        Object.keys(integration.config).some((k) => integration.config[k])
      ) {
        status.summary.configured++;
      }

      if (integration.authenticated) {
        status.summary.authenticated++;
      }

      // Count by type
      const type = integration.type;
      if (!status.summary.byType[type]) {
        status.summary.byType[type] = {
          total: 0,
          configured: 0,
          authenticated: 0,
        };
      }
      status.summary.byType[type].total++;

      if (
        integration.config &&
        Object.keys(integration.config).some((k) => integration.config[k])
      ) {
        status.summary.byType[type].configured++;
      }

      if (integration.authenticated) {
        status.summary.byType[type].authenticated++;
      }
    }

    return status;
  }

  /**
   * Verify integration
   * @param {String} key Integration key
   * @returns {Promise<Object>}
   */
  async verify(key) {
    const integration = this.get(key);
    if (!integration) {
      return { success: false, error: `Integration "${key}" not found` };
    }

    try {
      return await integration.verify();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * List all integration keys
   * @returns {Array<String>}
   */
  keys() {
    return Array.from(this.integrations.keys());
  }

  /**
   * List integrations by type
   * @param {String} type 'email', 'events', or 'social'
   * @returns {Array<{key: String, integration: BaseIntegration}>}
   */
  getByType(type) {
    const results = [];
    for (const [key, integration] of this.integrations) {
      if (integration.type === type) {
        results.push({ key, integration });
      }
    }
    return results;
  }
}

// Export singleton instance
module.exports = new IntegrationRegistry();
