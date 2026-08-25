/**
 * Meetup Events Integration Adapter
 * Handles event promotion via Meetup API
 */

const BaseIntegration = require("../BaseIntegration");

class MeetupAdapter extends BaseIntegration {
  constructor(config = {}) {
    super("Meetup", "events", config);
    this.capabilities = [
      "public_discovery", "oauth", "read_network", "read_groups", "read_events",
      "read_authorized_rsvps", "request_event_create", "request_event_update",
    ];
  }

  getVersion() {
    return "graphql-2025";
  }

  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Verify Meetup connection
   */
  async verify() {
    try {
      return {
        success: false,
        message: "Use the workspace-scoped official Meetup OAuth connection; this adapter never simulates authentication.",
      };
    } catch (error) {
      this.setError(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Post event to Meetup group
   * @param {Object} params { groupId, name, description, startTime, endTime }
   * @returns {Promise<Object>}
   */
  async postEvent(params) {
    try {
      throw new Error("Direct Meetup publishing is disabled. Create a human-approved Meetup action request.");
    } catch (error) {
      this.setError(error.message);
      throw error;
    }
  }

  /**
   * List group events
   * @param {String} groupId
   * @returns {Promise<Object>}
   */
  async listEvents(groupId) {
    try {
      throw new Error("Use the official Meetup GraphQL connection to list events.");
    } catch (error) {
      this.setError(error.message);
      throw error;
    }
  }
}

module.exports = MeetupAdapter;
