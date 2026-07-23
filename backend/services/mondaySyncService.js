/**
 * Monday Sync Service
 * Orchestrates syncing contacts from Monday.com CRM
 */

const MondayAdapter = require("./integrations/MondayAdapter");
const IntegrationConnection = require("../models/IntegrationConnection");
const MondaySyncHistory = require("../models/MondaySyncHistory");
const contactService = require("./contactService");

class MondaySyncService {
  /**
   * Sync contacts from Monday CRM
   * @param {String} audienceId - Optional audience ID to filter contacts
   * @returns {Object} Sync result { created, updated, duplicates, errors }
   */
  async syncMondayContacts(audienceId = null) {
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();
    let syncResult = null;
    let error = null;
    let errorStack = null;

    try {
      // Get Monday API credentials
      const credentials = await this.getMondayCredentials();
      if (!credentials || !credentials.apiKey) {
        throw new Error("Monday API credentials not configured");
      }

      // Create adapter instance
      const adapter = new MondayAdapter();

      // Validate connection
      const isValid = await adapter.validateConnection(credentials);
      if (!isValid) {
        throw new Error("Monday API connection failed - check credentials");
      }

      // Sync contacts from Monday
      const mondayContacts = await adapter.syncContacts(credentials);

      if (!Array.isArray(mondayContacts) || mondayContacts.length === 0) {
        syncResult = {
          created: 0,
          updated: 0,
          duplicates: 0,
          errors: 0,
          message: "No contacts found in Monday board",
        };
      } else {
        // Sync contacts using contact service (handles duplicate prevention)
        const serviceResult = await contactService.syncContactsFromSource(
          "monday",
          mondayContacts,
        );

        syncResult = {
          ...serviceResult,
          errors: 0,
          totalProcessed: mondayContacts.length,
          message: `Successfully synced Monday contacts: ${serviceResult.created} created, ${serviceResult.updated} updated, ${serviceResult.duplicates} duplicates`,
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
      console.error("[MondaySyncService] Sync error:", error);

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
   * Get Monday API credentials
   * @private
   * @returns {Object|null} Credentials { apiKey, boardId }
   */
  async getMondayCredentials() {
    try {
      // Try to get from IntegrationConnection
      const connection = await IntegrationConnection.findOne({
        provider: "monday",
      }).select("+credentials");

      if (connection && connection.credentials) {
        return connection.credentials;
      }

      // Fall back to environment variables
      const apiKey = process.env.MONDAY_API_KEY;
      const boardId = process.env.MONDAY_CONTACTS_BOARD_ID;

      if (apiKey) {
        return {
          apiKey,
          boardId: boardId || null,
        };
      }

      return null;
    } catch (err) {
      console.error("[MondaySyncService] Get credentials error:", err.message);
      return null;
    }
  }

  /**
   * Test Monday connection
   * @returns {Object} { connected, account, message }
   */
  async testConnection() {
    try {
      const credentials = await this.getMondayCredentials();
      if (!credentials || !credentials.apiKey) {
        return {
          connected: false,
          account: null,
          message: "Monday API credentials not configured",
        };
      }

      const adapter = new MondayAdapter();
      const isValid = await adapter.validateConnection(credentials);

      if (!isValid) {
        return {
          connected: false,
          account: null,
          message: "Monday API connection failed",
        };
      }

      // Get user info for confirmation
      const userInfo = await adapter.fetchUserInfo(credentials);

      return {
        connected: true,
        account: userInfo,
        message: `Connected to Monday as ${userInfo?.name || "Unknown"}`,
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
   * @returns {Object} Stats about Monday contacts and recent sync history
   */
  async getSyncStatus() {
    try {
      // Get Monday contacts from database
      const mondayContacts = await contactService.getContacts({
        source: "monday",
      });
      const stats = await contactService.getStats();

      // Get last sync record
      const lastSync = await MondaySyncHistory.findOne()
        .sort({ createdAt: -1 })
        .lean();

      return {
        totalMondayContacts: mondayContacts.length,
        totalContacts: stats.total,
        bySource: stats.bySource,
        byStatus: stats.byStatus,
        lastMondayContactCreated: mondayContacts[0]?.createdAt || null,
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
      console.error("[MondaySyncService] Get status error:", error.message);
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

      const history = new MondaySyncHistory({
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
      console.log(`[MondaySyncService] Recorded sync ${syncData.syncId}`);
    } catch (err) {
      console.error(
        "[MondaySyncService] Failed to record sync history:",
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
      const history = await MondaySyncHistory.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return history;
    } catch (error) {
      console.error("[MondaySyncService] Get history error:", error.message);
      throw error;
    }
  }
}

module.exports = new MondaySyncService();
