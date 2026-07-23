const express = require("express");
const mongoose = require("mongoose");
const MarketingCampaign = require("../models/MarketingCampaign");
const Audience = require("../models/Audience");
const marketingCampaignExecutionService = require("../services/marketingCampaignExecution");

const router = express.Router();

/**
 * GET /api/marketing-campaigns
 * List marketing campaigns with filters
 */
router.get("/", async (req, res) => {
  try {
    const {
      status,
      type,
      audienceId,
      page = "1",
      limit = "25",
      sort = "recent",
    } = req.query;

    // Build filter
    const filter = {};
    if (status) {
      if (
        ![
          "draft",
          "scheduled",
          "active",
          "completed",
          "paused",
          "archived",
        ].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid status. Must be one of: draft, scheduled, active, completed, paused, archived",
        });
      }
      filter.status = status;
    }

    if (type) {
      if (!["email", "social", "event"].includes(type)) {
        return res.status(400).json({
          success: false,
          error: "Invalid type. Must be one of: email, social, event",
        });
      }
      filter.type = type;
    }

    if (audienceId) {
      if (!audienceId.match(/^[0-9a-f]{24}$/i)) {
        return res.status(400).json({
          success: false,
          error: "Invalid audienceId format",
        });
      }
      filter.audienceId = new mongoose.Types.ObjectId(audienceId);
    }

    // Parse pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    // Determine sort
    let sortObj = { createdAt: -1 };
    if (sort === "name") {
      sortObj = { name: 1 };
    } else if (sort === "status") {
      sortObj = { status: 1, createdAt: -1 };
    } else if (sort === "scheduled") {
      sortObj = { scheduledFor: 1, createdAt: -1 };
    }

    const skip = (pageNum - 1) * limitNum;

    const [campaigns, total] = await Promise.all([
      MarketingCampaign.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .select("-content.htmlBody") // Exclude large HTML body
        .lean(),
      MarketingCampaign.countDocuments(filter),
    ]);

    // Enrich with audience info
    const audienceIds = [
      ...new Set(campaigns.map((c) => c.audienceId.toString())),
    ];
    const audiences = await Audience.find({
      _id: { $in: audienceIds },
    })
      .select("_id name")
      .lean();

    const audienceMap = Object.fromEntries(
      audiences.map((a) => [a._id.toString(), a.name]),
    );

    const enriched = campaigns.map((c) => ({
      ...c,
      audienceName: audienceMap[c.audienceId.toString()] || "Unknown",
    }));

    return res.json({
      success: true,
      data: {
        campaigns: enriched,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("GET /marketing-campaigns error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve campaigns",
    });
  }
});

/**
 * GET /api/marketing-campaigns/:id
 * Get campaign details
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    const campaign = await MarketingCampaign.findById(id).lean();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Enrich with audience
    const audience = await Audience.findById(campaign.audienceId)
      .select("_id name")
      .lean();

    return res.json({
      success: true,
      data: {
        campaign,
        audience,
      },
    });
  } catch (error) {
    console.error("GET /marketing-campaigns/:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve campaign",
    });
  }
});

/**
 * POST /api/marketing-campaigns
 * Create new marketing campaign
 */
router.post("/", async (req, res) => {
  try {
    const { name, type, audienceId, content, notes, scheduledFor } = req.body;

    // Validate required fields
    if (!name || !type || !audienceId) {
      return res.status(400).json({
        success: false,
        error: "name, type, and audienceId are required",
      });
    }

    // Validate type
    if (!["email", "social", "event"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be one of: email, social, event",
      });
    }

    // Validate audienceId format
    if (!audienceId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid audienceId format",
      });
    }

    // Verify audience exists
    const audience = await Audience.findById(audienceId)
      .select("_id name")
      .lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate content based on type
    if (!content) {
      return res.status(400).json({
        success: false,
        error: "content is required",
      });
    }

    if (type === "email" && !content.subject && !content.body) {
      return res.status(400).json({
        success: false,
        error: "Email campaigns require subject and body",
      });
    }

    if (type === "social" && !content.caption && !content.imageUrls) {
      return res.status(400).json({
        success: false,
        error: "Social campaigns require caption and/or images",
      });
    }

    if (type === "event" && !content.eventName && !content.eventDate) {
      return res.status(400).json({
        success: false,
        error: "Event campaigns require eventName and eventDate",
      });
    }

    // Create campaign
    const campaign = await MarketingCampaign.create({
      name,
      type,
      audienceId,
      content,
      notes: notes || "",
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      status: "draft",
    });

    return res.status(201).json({
      success: true,
      data: {
        campaign,
        audience,
      },
      message: "Campaign created successfully",
    });
  } catch (error) {
    console.error("POST /marketing-campaigns error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create campaign",
    });
  }
});

/**
 * PATCH /api/marketing-campaigns/:id
 * Update campaign
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, content, notes, scheduledFor } = req.body;

    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    const campaign = await MarketingCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Validate status if provided
    if (status) {
      const validStatuses = [
        "draft",
        "scheduled",
        "active",
        "completed",
        "paused",
        "archived",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }
    }

    // Update fields
    if (name) campaign.name = name;
    if (status) campaign.status = status;
    if (content) campaign.content = { ...campaign.content, ...content };
    if (notes !== undefined) campaign.notes = notes;
    if (scheduledFor !== undefined) {
      campaign.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
    }

    await campaign.save();

    const audience = await Audience.findById(campaign.audienceId)
      .select("_id name")
      .lean();

    return res.json({
      success: true,
      data: {
        campaign,
        audience,
      },
      message: "Campaign updated successfully",
    });
  } catch (error) {
    console.error("PATCH /marketing-campaigns/:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update campaign",
    });
  }
});

/**
 * POST /api/marketing-campaigns/:id/execute
 * Execute email campaign to a single recipient
 */
router.post("/:id/execute", async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientEmail, testEmail } = req.body;

    // Validate campaign ID
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign ID format",
      });
    }

    // Validate recipient email
    const recipient = recipientEmail || testEmail;
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return res.status(400).json({
        success: false,
        error: "Valid recipientEmail or testEmail required",
      });
    }

    // Execute campaign
    const result = await marketingCampaignExecutionService.executeCampaign(id, {
      recipientEmail: recipient,
    });

    return res.json({
      success: true,
      data: result,
      message: "Campaign executed successfully",
    });
  } catch (error) {
    console.error("POST /:id/execute error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to execute campaign",
    });
  }
});

/**
 * POST /api/marketing-campaigns/:id/execute-batch
 * Execute email campaign to multiple recipients
 */
router.post("/:id/execute-batch", async (req, res) => {
  try {
    const { id } = req.params;
    const { recipients } = req.body;

    // Validate campaign ID
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign ID format",
      });
    }

    // Validate recipients
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: "recipients array required and must not be empty",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of recipients) {
      if (!emailRegex.test(recipient)) {
        return res.status(400).json({
          success: false,
          error: `Invalid email format: ${recipient}`,
        });
      }
    }

    // Execute batch
    const result = await marketingCampaignExecutionService.executeCampaignBatch(
      id,
      recipients,
    );

    return res.json({
      success: true,
      data: result,
      message: "Campaign batch executed successfully",
    });
  } catch (error) {
    console.error("POST /:id/execute-batch error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to execute campaign batch",
    });
  }
});

/**
 * POST /api/marketing-campaigns/:id/execute-contacts
 * Execute email campaign to contact recipients
 */
router.post("/:id/execute-contacts", async (req, res) => {
  try {
    const { id } = req.params;
    const { contacts } = req.body;

    // Validate campaign ID
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign ID format",
      });
    }

    // Validate contacts array
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: "contacts array required and must not be empty",
      });
    }

    // Validate contact format (must have email)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const contact of contacts) {
      if (!contact.email || !emailRegex.test(contact.email)) {
        return res.status(400).json({
          success: false,
          error: `Invalid contact: missing or invalid email`,
        });
      }
    }

    // Execute to contacts
    const result =
      await marketingCampaignExecutionService.executeCampaignToContacts(
        id,
        contacts,
      );

    return res.json({
      success: true,
      data: result,
      message: "Campaign executed to contacts successfully",
    });
  } catch (error) {
    console.error("POST /:id/execute-contacts error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to execute campaign to contacts",
    });
  }
});

/**
 * GET /api/marketing-campaigns/:id/status
 * Get campaign execution status
 */
router.get("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate campaign ID
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign ID format",
      });
    }

    const result =
      await marketingCampaignExecutionService.getCampaignStatus(id);

    return res.json({
      success: true,
      data: result.campaign,
    });
  } catch (error) {
    console.error("GET /:id/status error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve campaign status",
    });
  }
});

/**
 * PATCH /api/marketing-campaigns/:id/pause
 * Pause campaign execution
 */
router.patch("/:id/pause", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate campaign ID
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign ID format",
      });
    }

    const result = await marketingCampaignExecutionService.pauseCampaign(id);

    return res.json({
      success: true,
      data: result,
      message: "Campaign paused",
    });
  } catch (error) {
    console.error("PATCH /:id/pause error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Failed to pause campaign",
    });
  }
});

/**
 * PATCH /api/marketing-campaigns/:id/resume
 * Resume campaign execution
 */
router.patch("/:id/resume", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate campaign ID
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign ID format",
      });
    }

    const result = await marketingCampaignExecutionService.resumeCampaign(id);

    return res.json({
      success: true,
      data: result,
      message: "Campaign resumed",
    });
  } catch (error) {
    console.error("PATCH /:id/resume error:", error);
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Failed to resume campaign",
    });
  }
});

module.exports = router;
