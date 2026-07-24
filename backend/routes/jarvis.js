/**
 * Jarvis Assistant Routes
 * AI control layer for Ellie systems
 */

const express = require("express");
const jarvisService = require("../services/jarvisService");
const llmService = require("../services/llmService");
const jarvisMemoryService = require("../services/jarvisMemoryService");
const jarvisProfileService = require("../services/jarvisProfileService");

const router = express.Router();

/**
 * POST /api/jarvis/chat
 * Process natural language query and return insights
 * Request: { message }
 * Response: { answer, data, actionsAvailable }
 */
router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Message is required and must be a string",
      });
    }

    const result = await jarvisService.processQuery(message);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("POST /jarvis/chat error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to process query",
    });
  }
});

// Configuration-only status. This intentionally exposes no vault path or credentials.
router.get("/status", async (req, res) => {
  try {
    const memory = await jarvisMemoryService.getStatus();
    res.json({
      success: true,
      data: {
        openai: llmService.getStatus(),
        obsidian: memory,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to retrieve Jarvis configuration status" });
  }
});

router.get("/profile", async (req, res) => {
  try {
    res.json({ success: true, data: await jarvisProfileService.getProfile() });
  } catch {
    res.status(500).json({ success: false, error: "Failed to retrieve Jarvis profile" });
  }
});

router.put("/profile", async (req, res) => {
  try {
    res.json({ success: true, data: await jarvisProfileService.updateProfile(req.body) });
  } catch (error) {
    res.status(400).json({ success: false, error: "Jarvis profile settings are invalid" });
  }
});

function hasValidMemorySyncSecret(req) {
  const provided = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = process.env.JARVIS_MEMORY_SYNC_SECRET || "";
  if (!provided || !expected || provided.length !== expected.length) return false;
  return require("crypto").timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// This endpoint accepts only approved Markdown notes from the user's local vault bridge.
// It never returns note content and never accepts provider credentials.
router.post("/memory/sync", async (req, res) => {
  if (!hasValidMemorySyncSecret(req)) return res.status(401).json({ success: false, error: "Unauthorized vault bridge" });
  try {
    const result = await jarvisMemoryService.syncCloudNotes(req.body?.notes);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : "Vault sync failed" });
  }
});

/**
 * GET /api/jarvis/summary
 * Get system summary without natural language processing
 */
router.get("/summary", async (req, res) => {
  try {
    const [
      prioritySummary,
      topOrganizations,
      contactStats,
      campaignStatus,
      growthOpportunities,
    ] = await Promise.all([
      jarvisService.getPrioritySummary(),
      jarvisService.getTopOrganizations(),
      jarvisService.getContactStats(),
      jarvisService.getCampaignStatus(),
      jarvisService.getGrowthOpportunities(),
    ]);

    res.json({
      success: true,
      data: {
        priority: prioritySummary,
        topOrganizations,
        contacts: contactStats,
        campaigns: campaignStatus,
        growthOpportunities,
      },
    });
  } catch (error) {
    console.error("GET /jarvis/summary error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve summary",
    });
  }
});

/**
 * GET /api/jarvis/organizations
 * Get organization insights
 */
router.get("/organizations", async (req, res) => {
  try {
    const [topOrgs, stats] = await Promise.all([
      jarvisService.getTopOrganizations(),
      jarvisService.getOrganizationStats(),
    ]);

    res.json({
      success: true,
      data: {
        topOrganizations: topOrgs,
        stats,
      },
    });
  } catch (error) {
    console.error("GET /jarvis/organizations error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve organization insights",
    });
  }
});

/**
 * GET /api/jarvis/contacts
 * Get contact insights
 */
router.get("/contacts", async (req, res) => {
  try {
    const contactStats = await jarvisService.getContactStats();

    res.json({
      success: true,
      data: contactStats,
    });
  } catch (error) {
    console.error("GET /jarvis/contacts error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve contact insights",
    });
  }
});

/**
 * GET /api/jarvis/campaigns
 * Get campaign insights
 */
router.get("/campaigns", async (req, res) => {
  try {
    const campaignStatus = await jarvisService.getCampaignStatus();

    res.json({
      success: true,
      data: campaignStatus,
    });
  } catch (error) {
    console.error("GET /jarvis/campaigns error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve campaign insights",
    });
  }
});

/**
 * GET /api/jarvis/opportunities
 * Get growth opportunities
 */
router.get("/opportunities", async (req, res) => {
  try {
    const opportunities = await jarvisService.getGrowthOpportunities();

    res.json({
      success: true,
      data: opportunities,
    });
  } catch (error) {
    console.error("GET /jarvis/opportunities error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve growth opportunities",
    });
  }
});

// =========================================================================
// ACTION LAYER - Campaign Recommendations & Execution
// =========================================================================

/**
 * POST /api/jarvis/actions/recommend-campaign
 * Recommend and create a bootcamp campaign draft
 * Request: { audienceId?, organizationId?, templateType? }
 * Response: { campaign, message }
 */
router.post("/actions/recommend-campaign", async (req, res) => {
  try {
    const { audienceId, organizationId, templateType } = req.body;

    const result = await jarvisService.recommendCampaignDraft({
      audienceId,
      organizationId,
      templateType,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("POST /jarvis/actions/recommend-campaign error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to recommend campaign",
    });
  }
});

/**
 * POST /api/jarvis/actions/prepare-recipients
 * Generate campaign recipient summary
 * Request: { campaignId, source?, tags?, limit? }
 * Response: { recipientCount, bySource, recipients[], message }
 */
router.post("/actions/prepare-recipients", async (req, res) => {
  try {
    const { campaignId, source, tags, limit } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: "Campaign ID is required",
      });
    }

    const result = await jarvisService.prepareRecipients(campaignId, {
      source,
      tags,
      limit,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("POST /jarvis/actions/prepare-recipients error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to prepare recipients",
    });
  }
});

/**
 * POST /api/jarvis/actions/send-test-email
 * Prepare email campaign and send test
 * Request: { campaignId, testEmail }
 * Response: { messageId, status, sentAt }
 */
router.post("/actions/send-test-email", async (req, res) => {
  try {
    const { campaignId, testEmail } = req.body;

    if (!campaignId || !testEmail) {
      return res.status(400).json({
        success: false,
        error: "Campaign ID and test email are required",
      });
    }

    const result = await jarvisService.executeTestEmail(campaignId, testEmail);

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("POST /jarvis/actions/send-test-email error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to send test email",
    });
  }
});

/**
 * GET /api/jarvis/actions/campaign-status/:campaignId
 * Return campaign status and metrics
 * Response: { campaign, metrics, recipients, timeline }
 */
router.get("/actions/campaign-status/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await jarvisService.getCampaignExecutionStatus(campaignId);

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("GET /jarvis/actions/campaign-status error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve campaign status",
    });
  }
});

/**
 * POST /api/jarvis/voice
 * Voice interface: transcribe audio and process with Jarvis
 * Request: { audio: <base64 audio data> }
 * Response: { transcript, response }
 */
router.post("/voice", async (req, res) => {
  try {
    const speechService = require("../services/speechService");
    const { audio } = req.body;

    if (!audio) {
      return res.status(400).json({
        success: false,
        error: "Audio data is required",
      });
    }

    // Transcribe audio to text
    const transcript = await speechService.transcribeAudio(audio);

    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({
        success: false,
        error: "Failed to transcribe audio",
      });
    }

    // Process transcript with Jarvis chat logic
    const jarvisResponse = await jarvisService.processQuery(transcript);

    res.json({
      success: true,
      data: {
        transcript,
        response: jarvisResponse,
      },
    });
  } catch (error) {
    console.error("POST /jarvis/voice error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to process voice input",
    });
  }
});

module.exports = router;
