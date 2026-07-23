/**
 * Growth Operator Routes
 * Orchestrate audience analysis and opportunity identification
 */

const express = require("express");
const mongoose = require("mongoose");
const GrowthOperator = require("../models/GrowthOperator");
const GrowthOpportunity = require("../models/GrowthOpportunity");
const Audience = require("../models/Audience");
const growthOperatorService = require("../services/growthOperator");
const marketingActionService = require("../services/marketingAction");
const MarketingCampaign = require("../models/MarketingCampaign");
const Organization = require("../models/Organization");

const router = express.Router();

/**
 * POST /api/growth-operators/analyze/:audienceId
 * Start growth operator analysis for an audience
 */
router.post("/analyze/:audienceId", async (req, res) => {
  try {
    const { audienceId } = req.params;
    const { config } = req.body;

    // Validate audienceId
    if (!mongoose.Types.ObjectId.isValid(audienceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid audienceId format",
      });
    }

    // Verify audience exists
    const audience = await Audience.findById(audienceId);
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Start analysis
    const operator = await growthOperatorService.analyzeAudience(
      audienceId,
      config || {},
    );

    return res.status(201).json({
      success: true,
      data: {
        operatorId: operator._id,
        audienceId: operator.audienceId,
        status: operator.status,
        config: operator.config,
        createdAt: operator.createdAt,
      },
      message: "Growth operator analysis started",
    });
  } catch (error) {
    console.error("POST /analyze/:audienceId error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to start analysis",
    });
  }
});

/**
 * GET /api/growth-operators/:operatorId
 * Get operator status and metrics
 */
router.get("/:operatorId", async (req, res) => {
  try {
    const { operatorId } = req.params;

    // Validate operatorId
    if (!mongoose.Types.ObjectId.isValid(operatorId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid operatorId format",
      });
    }

    const operator = await GrowthOperator.findById(operatorId).lean();

    if (!operator) {
      return res.status(404).json({
        success: false,
        error: "Growth Operator not found",
      });
    }

    return res.json({
      success: true,
      data: operator,
    });
  } catch (error) {
    console.error("GET /growth-operators/:operatorId error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve operator",
    });
  }
});

/**
 * GET /api/growth-operators/:operatorId/opportunities
 * Get opportunities identified by this operator
 */
router.get("/:operatorId/opportunities", async (req, res) => {
  try {
    const { operatorId } = req.params;
    const { status, minPriority, page = 1, limit = 25 } = req.query;

    // Validate operatorId
    if (!mongoose.Types.ObjectId.isValid(operatorId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid operatorId format",
      });
    }

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (pageNum - 1) * pageSize;

    // Build query
    const query = { growthOperatorId: new mongoose.Types.ObjectId(operatorId) };

    if (status) {
      if (!["identified", "actioned", "skipped", "expired"].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status filter",
        });
      }
      query.status = status;
    }

    if (minPriority) {
      const score = parseInt(minPriority);
      if (isNaN(score) || score < 0 || score > 100) {
        return res.status(400).json({
          success: false,
          error: "minPriority must be between 0 and 100",
        });
      }
      query.priorityScore = { $gte: score };
    }

    // Execute query
    const [opportunities, total] = await Promise.all([
      GrowthOpportunity.find(query)
        .sort({ priorityScore: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate("organizationId", "name")
        .lean(),
      GrowthOpportunity.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: {
        opportunities,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error(
      "GET /growth-operators/:operatorId/opportunities error:",
      error,
    );
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve opportunities",
    });
  }
});

/**
 * GET /api/growth-operators/organizations/:organizationId/opportunities
 * Get opportunities for a specific organization across all audiences
 */
router.get("/organizations/:organizationId/opportunities", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { audienceId } = req.query;

    // Validate organizationId
    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid organizationId format",
      });
    }

    // Build query
    const query = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      status: "identified",
    };

    if (audienceId) {
      if (!mongoose.Types.ObjectId.isValid(audienceId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid audienceId format",
        });
      }
      query.audienceId = new mongoose.Types.ObjectId(audienceId);
    }

    const opportunities = await GrowthOpportunity.find(query)
      .sort({ priorityScore: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        organizationId,
        opportunities,
        count: opportunities.length,
      },
    });
  } catch (error) {
    console.error(
      "GET /growth-operators/organizations/:organizationId/opportunities error:",
      error,
    );
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve opportunities",
    });
  }
});

/**
 * PATCH /api/growth-operators/opportunities/:opportunityId/action
 * Mark opportunity as actioned or skipped
 */
router.patch("/opportunities/:opportunityId/action", async (req, res) => {
  try {
    const { opportunityId } = req.params;
    const { action, actionDetails } = req.body;

    // Validate opportunityId
    if (!mongoose.Types.ObjectId.isValid(opportunityId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid opportunityId format",
      });
    }

    // Validate action
    if (!action || !["actioned", "skipped"].includes(action)) {
      return res.status(400).json({
        success: false,
        error: "action must be 'actioned' or 'skipped'",
      });
    }

    let opportunity;

    if (action === "actioned") {
      opportunity = await growthOperatorService.markAsActioned(
        opportunityId,
        actionDetails || {},
      );
    } else {
      opportunity = await growthOperatorService.markAsSkipped(
        opportunityId,
        actionDetails?.reason || "",
      );
    }

    return res.json({
      success: true,
      data: opportunity,
      message: `Opportunity marked as ${action}`,
    });
  } catch (error) {
    if (error.message === "Opportunity not found") {
      return res.status(404).json({
        success: false,
        error: "Opportunity not found",
      });
    }

    console.error("PATCH /opportunities/:opportunityId/action error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update opportunity",
    });
  }
});

/**
 * GET /api/growth-operators/:operatorId/actions
 * Get executable marketing actions for this operator
 * Converts opportunities into actionable marketing tasks
 */
router.get("/:operatorId/actions", async (req, res) => {
  try {
    const { operatorId } = req.params;
    const {
      status,
      opportunityType,
      minPriority,
      page = 1,
      limit = 25,
    } = req.query;

    // Validate operatorId
    if (!mongoose.Types.ObjectId.isValid(operatorId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid operatorId format",
      });
    }

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 25));

    // Get actions
    const allActions = await marketingActionService.getOperatorActions(
      operatorId,
      {
        status,
        opportunityType,
        minPriority: minPriority ? parseInt(minPriority) : undefined,
      },
    );

    // Apply additional filters if provided
    let filteredActions = allActions;

    // Verify operator exists
    const operator = await GrowthOperator.findById(operatorId);
    if (!operator) {
      return res.status(404).json({
        success: false,
        error: "Growth Operator not found",
      });
    }

    // Manual pagination since we're filtering on converted data
    const total = filteredActions.length;
    const startIdx = (pageNum - 1) * pageSize;
    const actions = filteredActions.slice(startIdx, startIdx + pageSize);

    return res.json({
      success: true,
      data: {
        actions,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("GET /:operatorId/actions error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve marketing actions",
    });
  }
});

/**
 * GET /api/growth-operators/:operatorId/actions/summary
 * Get summary of marketing actions by type and status
 */
router.get("/:operatorId/actions/summary", async (req, res) => {
  try {
    const { operatorId } = req.params;

    // Validate operatorId
    if (!mongoose.Types.ObjectId.isValid(operatorId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid operatorId format",
      });
    }

    // Verify operator exists
    const operator = await GrowthOperator.findById(operatorId);
    if (!operator) {
      return res.status(404).json({
        success: false,
        error: "Growth Operator not found",
      });
    }

    // Get action summary
    const summary = await marketingActionService.getActionSummary(operatorId);

    return res.json({
      success: true,
      data: {
        operatorId,
        summary,
      },
    });
  } catch (error) {
    console.error("GET /:operatorId/actions/summary error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve action summary",
    });
  }
});

/**
 * GET /api/growth-operators/:operatorId/actions/history
 * Get completed marketing actions
 */
router.get("/:operatorId/actions/history", async (req, res) => {
  try {
    const { operatorId } = req.params;

    // Validate operatorId
    if (!mongoose.Types.ObjectId.isValid(operatorId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid operatorId format",
      });
    }

    // Verify operator exists
    const operator = await GrowthOperator.findById(operatorId);

    if (!operator) {
      return res.status(404).json({
        success: false,
        error: "Growth Operator not found",
      });
    }

    // Find completed actions
   const history = await GrowthOpportunity.find({
  growthOperatorId: operatorId,
  status: "actioned",
})
  .populate("organizationId", "name")
  .populate("actionTaken.campaignId")
  .sort({ "actionTaken.timestamp": -1 })
  .lean();

   const formattedHistory = history.map((opportunity) => ({
  opportunityId: opportunity._id,

  organization:
    opportunity.organizationId?.name || "Unknown",

  action: opportunity.suggestedAction,
    why: opportunity.reasons || [],

  campaign: opportunity.actionTaken?.campaignId
    ? {
        id: opportunity.actionTaken.campaignId._id,
        name: opportunity.actionTaken.campaignId.name,
        type: opportunity.actionTaken.campaignId.type,
        status: opportunity.actionTaken.campaignId.status,
        subject:
          opportunity.actionTaken.campaignId.content?.subject || "",
        body:
          opportunity.actionTaken.campaignId.content?.body || "",
      }
    : null,

  timestamp:
    opportunity.actionTaken?.timestamp ||
    opportunity.updatedAt,

  note:
    opportunity.actionTaken?.note || "",

  priorityScore:
    opportunity.priorityScore,
}));

    return res.json({
      success: true,
      data: {
        history: formattedHistory,
        count: formattedHistory.length,
      },
    });

  } catch (error) {
    console.error(
      "GET /:operatorId/actions/history error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Failed to retrieve action history",
    });
  }
});

/**
 * POST /api/growth-operators/:operatorId/actions/:opportunityId/execute
 * Execute a recommended marketing action
 */
router.post("/:operatorId/actions/:opportunityId/execute", async (req, res) => {
  try {
    const { operatorId, opportunityId } = req.params;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(operatorId) ||
      !mongoose.Types.ObjectId.isValid(opportunityId)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid ID format",
      });
    }

    // Verify Growth Operator exists
    const operator = await GrowthOperator.findById(operatorId);

    if (!operator) {
      return res.status(404).json({
        success: false,
        error: "Growth Operator not found",
      });
    }

    // Find opportunity
    const opportunity = await GrowthOpportunity.findById(opportunityId);

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        error: "Opportunity not found",
      });
    }

    // Prevent duplicate execution
if (opportunity.status === "actioned") {
  return res.status(400).json({
    success: false,
    error: "Opportunity has already been executed",
    campaignId: opportunity.actionTaken?.campaignId || null,
  });
}
    // Verify opportunity belongs to operator
    if (opportunity.growthOperatorId.toString() !== operatorId.toString()) {
      return res.status(400).json({
        success: false,
        error: "Opportunity does not belong to this operator",
      });
    }

    // Only campaign recommendations can execute
    if (opportunity.suggestedAction !== "create_campaign") {
      return res.status(400).json({
        success: false,
        error: "Opportunity is not a campaign action",
      });
    }

    // Get organization
    const organization = await Organization.findById(
      opportunity.organizationId,
    );

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // Create marketing campaign
    const campaign = await MarketingCampaign.create({
      name: opportunity.suggestedCampaign.name,

      type: opportunity.suggestedCampaign.type,

      audienceId: opportunity.audienceId,

      content: {
        subject: `Connecting with ${organization.name}`,
        body:
          opportunity.suggestedCampaign?.description ||
          `Initial outreach opportunity for ${organization.name}`,
        hashtags: [],
        imageUrls: [],
      },

      notes: opportunity.reasons.join("\n"),

      status: "draft",
    });

    // Update opportunity
    opportunity.status = "actioned";

    opportunity.actionTaken = {
      campaignId: campaign._id,
      timestamp: new Date(),
      note: "Campaign created from Growth Operator recommendation",
    };

    await opportunity.save();

    // Update operator metrics
    operator.metrics.campaignsCreated =
      (operator.metrics.campaignsCreated || 0) + 1;

    await operator.save();

    return res.json({
      success: true,
      campaign,
      message: "Campaign created from Growth Operator recommendation",
    });
  } catch (error) {
    console.error(
      "POST /:operatorId/actions/:opportunityId/execute error:",
      error,
    );

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to execute marketing action",
    });
  }
});
module.exports = router;
