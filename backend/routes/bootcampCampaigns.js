/**
 * Bootcamp Marketing Workflow Routes
 * Handles bootcamp/event campaign templates and workflows
 */

const express = require("express");
const mongoose = require("mongoose");
const bootcampWorkflowService = require("../services/bootcampMarketingWorkflow");
const MarketingCampaign = require("../models/MarketingCampaign");
const Audience = require("../models/Audience");

const router = express.Router();

/**
 * GET /api/bootcamp-campaigns/templates
 * Get all available campaign templates
 */
router.get("/templates", async (req, res) => {
  try {
    const templates = bootcampWorkflowService.getTemplates();

    return res.json({
      success: true,
      data: {
        templates,
        available: Object.keys(templates),
        count: Object.keys(templates).length,
      },
      message: "Available campaign templates",
    });
  } catch (error) {
    console.error("GET /templates error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve templates",
    });
  }
});

/**
 * GET /api/bootcamp-campaigns/templates/:templateName
 * Get a specific template
 */
router.get("/templates/:templateName", async (req, res) => {
  try {
    const { templateName } = req.params;

    const template = bootcampWorkflowService.getTemplate(templateName);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${templateName}`,
      });
    }

    return res.json({
      success: true,
      data: {
        name: templateName,
        template,
      },
    });
  } catch (error) {
    console.error("GET /templates/:templateName error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve template",
    });
  }
});

/**
 * POST /api/bootcamp-campaigns/create
 * Create a bootcamp campaign from template
 */
router.post("/create", async (req, res) => {
  try {
    const { audienceId, templateName, name, callToActionUrl, variables } =
      req.body;

    // Validate required fields
    if (!audienceId || !templateName) {
      return res.status(400).json({
        success: false,
        error: "audienceId and templateName are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(audienceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid audienceId format",
      });
    }

    // Create campaign
    const result = await bootcampWorkflowService.createBootcampCampaign(
      audienceId,
      templateName,
      {
        name,
        callToActionUrl,
        variables,
      },
    );

    return res.status(201).json({
      success: true,
      data: result,
      message: "Bootcamp campaign created",
    });
  } catch (error) {
    console.error("POST /create error:", error);
    if (
      error.message.includes("Audience not found") ||
      error.message.includes("Template not found")
    ) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create campaign",
    });
  }
});

/**
 * POST /api/bootcamp-campaigns/workflow
 * Create a complete bootcamp workflow with multiple campaigns
 */
router.post("/workflow", async (req, res) => {
  try {
    const { audienceId, name, campaigns } = req.body;

    // Validate required fields
    if (!audienceId || !campaigns || !Array.isArray(campaigns)) {
      return res.status(400).json({
        success: false,
        error: "audienceId and campaigns array are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(audienceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid audienceId format",
      });
    }

    if (campaigns.length === 0) {
      return res.status(400).json({
        success: false,
        error: "campaigns array must not be empty",
      });
    }

    // Validate each campaign config
    for (const campaign of campaigns) {
      if (!campaign.template) {
        return res.status(400).json({
          success: false,
          error: "Each campaign must have a template",
        });
      }
    }

    // Create workflow
    const result = await bootcampWorkflowService.createBootcampWorkflow(
      audienceId,
      {
        name,
        campaigns,
      },
    );

    return res.status(201).json({
      success: true,
      data: result,
      message: "Bootcamp workflow created",
    });
  } catch (error) {
    console.error("POST /workflow error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create workflow",
    });
  }
});

/**
 * PATCH /api/bootcamp-campaigns/:campaignId/schedule
 * Schedule a campaign for future execution
 */
router.patch("/:campaignId/schedule", async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { scheduledFor } = req.body;

    // Validate
    if (!campaignId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaignId format",
      });
    }

    if (!scheduledFor) {
      return res.status(400).json({
        success: false,
        error: "scheduledFor date is required",
      });
    }

    // Schedule campaign
    const result = await bootcampWorkflowService.scheduleCampaign(
      campaignId,
      scheduledFor,
    );

    return res.json({
      success: true,
      data: result,
      message: "Campaign scheduled",
    });
  } catch (error) {
    console.error("PATCH /:campaignId/schedule error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message.includes("future")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to schedule campaign",
    });
  }
});

/**
 * GET /api/bootcamp-campaigns/:campaignId/performance
 * Get campaign performance metrics
 */
router.get("/:campaignId/performance", async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Validate
    if (!campaignId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaignId format",
      });
    }

    const result =
      await bootcampWorkflowService.getCampaignPerformance(campaignId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET /:campaignId/performance error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve performance metrics",
    });
  }
});

/**
 * GET /api/bootcamp-campaigns/audience/:audienceId/summary
 * Get all campaigns summary for an audience
 */
router.get("/audience/:audienceId/summary", async (req, res) => {
  try {
    const { audienceId } = req.params;

    // Validate
    if (!audienceId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid audienceId format",
      });
    }

    const result =
      await bootcampWorkflowService.getAudienceCampaignsSummary(audienceId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET /audience/:audienceId/summary error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve summary",
    });
  }
});

/**
 * POST /api/bootcamp-campaigns/execute-scheduled
 * Execute all scheduled campaigns that are due
 * (Typically called by background job)
 */
router.post("/execute-scheduled", async (req, res) => {
  try {
    const result = await bootcampWorkflowService.executeScheduledCampaigns();

    return res.json({
      success: true,
      data: result,
      message: `Executed ${result.executedCount} campaigns`,
    });
  } catch (error) {
    console.error("POST /execute-scheduled error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to execute scheduled campaigns",
    });
  }
});

module.exports = router;
