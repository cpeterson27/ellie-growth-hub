/**
 * Integration Connection Routes
 * Manage credentials and connections for platforms
 */

const express = require("express");
const IntegrationConnection = require("../models/IntegrationConnection");
const integrationRegistry = require("../services/integrations");

const router = express.Router();

const VALID_PROVIDERS = [
  "resend",
  "eventbrite",
  "meetup",
  "linkedin",
  "facebook",
  "instagram",
  "x",
];

/**
 * POST /api/integration-connections/connect
 * Connect/configure a new integration provider
 */
router.post("/connect", async (req, res) => {
  try {
    const { provider, credentials, config } = req.body;

    // Validate provider
    if (!provider) {
      return res.status(400).json({
        success: false,
        error: "provider is required",
      });
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    // Validate credentials
    if (!credentials || typeof credentials !== "object") {
      return res.status(400).json({
        success: false,
        error: "credentials object is required",
      });
    }

    // Check if already exists
    let connection = await IntegrationConnection.findOne({ provider });

    if (connection) {
      // Update existing connection
      connection.credentials = credentials;
      connection.config = config || connection.config;
      connection.status = "configured";
      connection.lastError = null;
      connection.updatedAt = new Date();
    } else {
      // Create new connection
      connection = new IntegrationConnection({
        provider,
        credentials,
        config: config || {},
        status: "configured",
      });
    }

    await connection.save();

    // Return safe response (no credentials)
    return res.status(201).json({
      success: true,
      data: {
        provider: connection.provider,
        status: connection.status,
        config: connection.config,
        connectedAt: connection.connectedAt,
        updatedAt: connection.updatedAt,
      },
      message: `${provider} connection configured successfully`,
    });
  } catch (error) {
    console.error("POST /integration-connections/connect error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to configure integration",
    });
  }
});

/**
 * GET /api/integration-connections
 * List all configured integrations
 */
router.get("/", async (req, res) => {
  try {
    const connections = await IntegrationConnection.find()
      .select("-credentials") // Exclude credentials
      .sort({ provider: 1 });

    // Enrich with current adapter status
    const enriched = connections.map((conn) => {
      const adapter = integrationRegistry.get(conn.provider);
      return {
        provider: conn.provider,
        status: conn.status,
        authenticated: adapter?.authenticated || false,
        config: conn.config,
        connectedAt: conn.connectedAt,
        lastVerifiedAt: conn.lastVerifiedAt,
        lastError: conn.lastError,
        updatedAt: conn.updatedAt,
      };
    });

    return res.json({
      success: true,
      data: {
        total: enriched.length,
        connections: enriched,
      },
    });
  } catch (error) {
    console.error("GET /integration-connections error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve integrations",
    });
  }
});

/**
 * GET /api/integration-connections/:provider
 * Get specific integration connection
 */
router.get("/:provider", async (req, res) => {
  try {
    const { provider } = req.params;

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const connection = await IntegrationConnection.findOne({ provider }).select(
      "-credentials",
    );

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: `${provider} not connected`,
      });
    }

    // Enrich with adapter status
    const adapter = integrationRegistry.get(provider);

    return res.json({
      success: true,
      data: {
        provider: connection.provider,
        status: connection.status,
        authenticated: adapter?.authenticated || false,
        config: connection.config,
        connectedAt: connection.connectedAt,
        lastVerifiedAt: connection.lastVerifiedAt,
        lastError: connection.lastError,
        updatedAt: connection.updatedAt,
      },
    });
  } catch (error) {
    console.error(`GET /integration-connections/:provider error:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve integration",
    });
  }
});

/**
 * DELETE /api/integration-connections/:provider
 * Disconnect a provider
 */
router.delete("/:provider", async (req, res) => {
  try {
    const { provider } = req.params;

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
      });
    }

    const connection = await IntegrationConnection.findOneAndDelete({
      provider,
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: `${provider} not connected`,
      });
    }

    return res.json({
      success: true,
      data: { provider },
      message: `${provider} disconnected successfully`,
    });
  } catch (error) {
    console.error(`DELETE /integration-connections/:provider error:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to disconnect integration",
    });
  }
});

module.exports = router;
