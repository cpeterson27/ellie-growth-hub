const express = require("express");
const integrationRegistry = require("../services/integrations");
const integrationHub = require("../services/integrationHub");

const router = express.Router();

/**
 * GET /api/integrations/hub
 * Read-only provider metadata and connection visibility for the Integration Hub.
 */
router.get("/hub", async (req, res) => {
  try {
    const providers = await integrationHub.listProviders();
    return res.json({ success: true, data: { providers } });
  } catch (error) {
    console.error("GET /integrations/hub error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve Integration Hub providers",
    });
  }
});

/**
 * GET /api/integrations/health
 * Read-only health snapshot for all registered providers.
 */
router.get("/health", async (req, res) => {
  try {
    const providers = await integrationHub.getHealth();
    return res.json({ providers });
  } catch (error) {
    console.error("GET /integrations/health error:", error);
    return res.status(500).json({
      error: "Failed to retrieve Integration Hub health",
    });
  }
});

/**
 * GET /api/integrations/hub/:provider/capabilities
 * Discover operations exposed by a registered provider.
 */
router.get("/hub/:provider/capabilities", (req, res) => {
  const capabilities = integrationHub.getCapabilities(req.params.provider);

  if (!capabilities) {
    return res.status(404).json({
      success: false,
      error: `Provider "${req.params.provider}" not found`,
    });
  }

  return res.json({ success: true, data: capabilities });
});

/**
 * GET /api/integrations/status
 * Get status of all available integrations
 */
router.get("/status", async (req, res) => {
  try {
    const status = await integrationRegistry.getStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("GET /integrations/status error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve integration status",
    });
  }
});

/**
 * GET /api/integrations/:id
 * Get specific integration status
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const integration = integrationRegistry.get(id);

    if (!integration) {
      return res.status(404).json({
        success: false,
        error: `Integration "${id}" not found`,
      });
    }

    const status = await integration.getStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error(`GET /integrations/:${id} error:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve integration status",
    });
  }
});

/**
 * GET /api/integrations
 * List all available integrations
 */
router.get("/", (req, res) => {
  try {
    const keys = integrationRegistry.keys();
    const integrations = keys.map((key) => {
      const integration = integrationRegistry.get(key);
      return {
        id: key,
        name: integration.name,
        type: integration.type,
        version: integration.getVersion(),
        capabilities: integration.getCapabilities(),
      };
    });

    return res.json({
      success: true,
      data: {
        total: integrations.length,
        integrations,
      },
    });
  } catch (error) {
    console.error("GET /integrations error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve integrations",
    });
  }
});

/**
 * POST /api/integrations/email/send-test
 * Send a test email via Resend
 */
router.post("/email/send-test", async (req, res) => {
  try {
    const { to, subject, html } = req.body;

    // Get from environment
    const from = process.env.EMAIL_FROM || "test@example.com";

    // Validate required fields
    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: to, subject, html",
      });
    }

    // Get Resend adapter
    const resend = integrationRegistry.get("resend");
    if (!resend) {
      return res.status(404).json({
        success: false,
        error: "Resend integration not available",
      });
    }

    // Send email
    const result = await resend.sendEmail({
      to,
      subject,
      html,
      from,
    });

    return res.json({
      success: true,
      data: result,
      message: "Test email sent successfully",
    });
  } catch (error) {
    console.error("POST /integrations/email/send-test error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send test email",
    });
  }
});

module.exports = router;
