/**
 * Eventbrite Sync Service
 * Orchestrates syncing attendees from Eventbrite events into contacts
 */

const EventbriteAdapter = require("./integrations/EventbriteAdapter");
const IntegrationConnection = require("../models/IntegrationConnection");
const EventbriteSyncHistory = require("../models/EventbriteSyncHistory");
const contactService = require("./contactService");

class EventbriteSyncService {
  /**
   * Sync attendees from Eventbrite events
   * @returns {Object} Sync result { created, updated, duplicates, totalProcessed }
   */
  async syncEventbriteAttendees() {
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();
    let syncResult = null;
    let error = null;
    let errorStack = null;

    try {
      // Get Eventbrite API credentials
      const credentials = await this.getEventbriteCredentials();
      if (!credentials || !credentials.apiKey) {
        throw new Error("Eventbrite API credentials not configured");
      }

      // Create adapter instance
      const adapter = new EventbriteAdapter();

      // Validate connection
      const isValid = await adapter.validateConnection(credentials);
      if (!isValid) {
        throw new Error(
          "Eventbrite API connection failed - check credentials or event IDs",
        );
      }

      // Fetch attendees from Eventbrite
      const eventbriteAttendees = await adapter.syncAttendees(credentials);

      if (
        !Array.isArray(eventbriteAttendees) ||
        eventbriteAttendees.length === 0
      ) {
        syncResult = {
          created: 0,
          updated: 0,
          duplicates: 0,
          message: "No attendees found in Eventbrite events",
        };
      } else {
        // Sync contacts using contact service (handles duplicate prevention)
        const serviceResult = await contactService.syncContactsFromSource(
          "eventbrite",
          eventbriteAttendees,
        );

        syncResult = {
          ...serviceResult,
          totalProcessed: eventbriteAttendees.length,
          message: `Successfully synced Eventbrite attendees: ${serviceResult.created} created, ${serviceResult.updated} updated, ${serviceResult.duplicates} duplicates`,
        };
      }

      // Record sync history
      const endTime = new Date();
      await this.recordSyncHistory({
        syncId,
        startTime,
        endTime,
        status: "success",
        ...syncResult,
      });

      return syncResult;
    } catch (err) {
      error = err.message;
      errorStack = err.stack;
      console.error("[EventbriteSyncService] Sync error:", error);

      // Record failed sync
      const endTime = new Date();
      await this.recordSyncHistory({
        syncId,
        startTime,
        endTime,
        status: "failed",
        error,
        errorStack,
        message: `Sync failed: ${error}`,
        created: 0,
        updated: 0,
        duplicates: 0,
        skipped: 0,
        totalProcessed: 0,
      });

      throw err;
    }
  }

  /**
   * Get Eventbrite API credentials
   * @private
   * @returns {Object|null} Credentials { apiKey, eventIds }
   */
  async getEventbriteCredentials() {
    try {
      // Try to get from IntegrationConnection
      const connection = await IntegrationConnection.findOne({
        provider: "eventbrite",
      }).select("credentials");

      if (connection && connection.credentials) {
        return connection.credentials;
      }

      // Fall back to environment variables
      const apiKey = process.env.EVENTBRITE_PRIVATE_TOKEN;
      const eventIds = process.env.EVENTBRITE_EVENT_IDS?.split(",") || [];

      if (apiKey) {
        return {
          apiKey,
          eventIds: eventIds.filter((id) => id.trim().length > 0),
        };
      }

      return null;
    } catch (err) {
      console.error(
        "[EventbriteSyncService] Get credentials error:",
        err.message,
      );
      return null;
    }
  }

  /**
   * Test Eventbrite connection
   * @returns {Object} { connected, account, message }
   */
  async testConnection() {
    try {
      const credentials = await this.getEventbriteCredentials();
      if (!credentials || !credentials.apiKey) {
        return {
          connected: false,
          account: null,
          message: "Eventbrite API credentials not configured",
        };
      }

      const adapter = new EventbriteAdapter();
      const isValid = await adapter.validateConnection(credentials);

      if (!isValid) {
        return {
          connected: false,
          account: null,
          message: "Eventbrite API connection failed",
        };
      }

      // Get user info for confirmation
      const userInfo = await adapter.fetchUserInfo(credentials);

      return {
        connected: true,
        account: userInfo,
        message: `Connected to Eventbrite as ${userInfo?.name || "Unknown"}`,
      };
    } catch (error) {
      return {
        connected: false,
        account: null,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  /**
   * Get sync status and statistics
   * @returns {Object} Stats about Eventbrite attendees and recent sync history
   */
  async getSyncStatus() {
    try {
      // Get Eventbrite contacts from database
      const eventbriteContacts = await contactService.getContacts({
        source: "eventbrite",
      });
      const stats = await contactService.getStats();

      // Get last sync record
      const lastSync = await EventbriteSyncHistory.findOne()
        .sort({ createdAt: -1 })
        .lean();

      return {
        totalEventbriteContacts: eventbriteContacts.length,
        totalContacts: stats.total,
        bySource: stats.bySource,
        byStatus: stats.byStatus,
        lastEventbriteContactCreated: eventbriteContacts[0]?.createdAt || null,
        lastSync: lastSync
          ? {
              syncId: lastSync.syncId,
              startTime: lastSync.startTime,
              endTime: lastSync.endTime,
              durationMs: lastSync.durationMs,
              status: lastSync.status,
              created: lastSync.created,
              updated: lastSync.updated,
              duplicates: lastSync.duplicates,
              skipped: lastSync.skipped,
              totalProcessed: lastSync.totalProcessed,
              message: lastSync.message,
            }
          : null,
      };
    } catch (error) {
      console.error("[EventbriteSyncService] Get status error:", error.message);
      throw error;
    }
  }

  /**
   * Record sync history
   * @private
   * @param {Object} syncData - Sync result data
   */
  async recordSyncHistory(syncData) {
    try {
      const durationMs = syncData.endTime - syncData.startTime;

      const history = new EventbriteSyncHistory({
        syncId: syncData.syncId,
        startTime: syncData.startTime,
        endTime: syncData.endTime,
        durationMs,
        status: syncData.status,
        created: syncData.created || 0,
        updated: syncData.updated || 0,
        duplicates: syncData.duplicates || 0,
        skipped: syncData.skipped || 0,
        totalProcessed: syncData.totalProcessed || 0,
        error: syncData.error || null,
        errorStack: syncData.errorStack || null,
        message: syncData.message || "",
      });

      await history.save();
      console.log(`[EventbriteSyncService] Recorded sync ${syncData.syncId}`);
    } catch (err) {
      console.error(
        "[EventbriteSyncService] Failed to record sync history:",
        err.message,
      );
    }
  }

  /**
   * Get sync history
   * @param {Number} limit - Max number of records to return
   * @returns {Array} Recent sync operations
   */
  async getSyncHistory(limit = 10) {
    try {
      const history = await EventbriteSyncHistory.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return history;
    } catch (error) {
      console.error(
        "[EventbriteSyncService] Get history error:",
        error.message,
      );
      throw error;
    }
  }
}

module.exports = new EventbriteSyncService();
