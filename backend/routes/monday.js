/**
 * Monday CRM Sync Routes
 * Manage Monday contact synchronization
 */

const express = require("express");
const mondaySyncService = require("../services/mondaySyncService");

const router = express.Router();

/**
 * POST /api/monday/sync
 * Trigger Monday contact sync
 */
router.post("/sync", async (req, res) => {
  try {
    const result = await mondaySyncService.syncMondayContacts();

    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (error) {
    console.error("POST /monday/sync error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to sync Monday contacts",
    });
  }
});

/**
 * POST /api/monday/test-connection
 * Test Monday API connection
 */
router.post("/test-connection", async (req, res) => {
  try {
    const result = await mondaySyncService.testConnection();

    if (result.connected) {
      res.json({
        success: true,
        data: result,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        data: result,
        message: result.message,
      });
    }
  } catch (error) {
    console.error("POST /monday/test-connection error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to test Monday connection",
    });
  }
});

/**
 * GET /api/monday/status
 * Get Monday sync status and statistics
 */
router.get("/status", async (req, res) => {
  try {
    const status = await mondaySyncService.getSyncStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("GET /monday/status error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve Monday sync status",
    });
  }
});

/**
 * GET /api/monday/history
 * Get sync history
 */
router.get("/history", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const history = await mondaySyncService.getSyncHistory(limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("GET /monday/history error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve sync history",
    });
  }
});

module.exports = router;
