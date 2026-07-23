const express = require("express");
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const Audience = require("../models/Audience");
const OrganizationRelationship = require("../models/OrganizationRelationship");

const router = express.Router();

// ======================================
// GET ORGANIZATION RELATIONSHIP
// Return current relationship state for org in a specific audience
// ======================================

router.get("/:organizationId/relationship", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { audienceId } = req.query;

    // Validate organization ID format
    if (!organizationId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // Verify organization exists
    const organization = await Organization.findById(organizationId)
      .select(
        "name domain industry priorityScore priorityTier audienceScore audienceTier",
      )
      .lean();

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // If no audienceId provided, return all relationships for this org
    if (!audienceId) {
      const relationships = await OrganizationRelationship.find({
        organizationId,
      }).lean();

      if (relationships.length === 0) {
        return res.json({
          success: true,
          organization,
          relationships: [],
          message: "No relationships found for this organization",
        });
      }

      // Enrich with audience names
      const audienceIds = relationships.map((r) => r.audienceId);
      const audiences = await Audience.find({ _id: { $in: audienceIds } })
        .select("_id name")
        .lean();

      const audienceMap = Object.fromEntries(
        audiences.map((a) => [a._id.toString(), a.name]),
      );

      const enrichedRelationships = relationships.map((r) => ({
        ...r,
        audienceName: audienceMap[r.audienceId.toString()] || "Unknown",
      }));

      return res.json({
        success: true,
        organization,
        relationships: enrichedRelationships,
      });
    }

    // Validate audience ID format
    if (!audienceId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
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

    // Get the specific relationship
    const relationship = await OrganizationRelationship.findOne({
      organizationId,
      audienceId,
    }).lean();

    if (!relationship) {
      return res.status(404).json({
        success: false,
        error: "Relationship not found",
      });
    }

    return res.json({
      success: true,
      organization,
      audience: {
        _id: audience._id,
        name: audience.name,
      },
      relationship: {
        _id: relationship._id,
        status: relationship.status,
        notes: relationship.notes,
        lastChangedAt: relationship.lastChangedAt,
        createdAt: relationship.createdAt,
      },
    });
  } catch (error) {
    console.error("GET /:organizationId/relationship error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve relationship",
    });
  }
});

// ======================================
// UPDATE ORGANIZATION RELATIONSHIP
// Change status and notes for relationship
// ======================================

router.patch("/:organizationId/relationship", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { audienceId, status, notes } = req.body;

    // Validate organization ID format
    if (!organizationId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // Validate audience ID format
    if (!audienceId || !audienceId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({
        success: false,
        error: "audienceId is required and must be a valid ObjectId",
      });
    }

    // Validate status
    const validStatuses = [
      "new",
      "reviewing",
      "qualified",
      "partner",
      "customer",
      "rejected",
    ];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Validate notes if provided
    if (notes !== undefined && typeof notes !== "string") {
      return res.status(400).json({
        success: false,
        error: "notes must be a string",
      });
    }

    if (notes && notes.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "notes must be 1000 characters or less",
      });
    }

    // Verify organization exists
    const organization = await Organization.findById(organizationId)
      .select("_id name domain")
      .lean();

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
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

    // Get existing relationship
    let relationship = await OrganizationRelationship.findOne({
      organizationId,
      audienceId,
    });

    if (!relationship) {
      return res.status(404).json({
        success: false,
        error: "Relationship not found",
      });
    }

    // Update status and notes
    const oldStatus = relationship.status;
    relationship.status = status;
    relationship.notes = notes || "";
    relationship.lastChangedAt = new Date();

    await relationship.save();

    return res.json({
      success: true,
      message: `Relationship status updated from ${oldStatus} to ${status}`,
      organization: {
        _id: organization._id,
        name: organization.name,
        domain: organization.domain,
      },
      audience: {
        _id: audience._id,
        name: audience.name,
      },
      relationship: {
        _id: relationship._id,
        status: relationship.status,
        notes: relationship.notes,
        lastChangedAt: relationship.lastChangedAt,
        createdAt: relationship.createdAt,
      },
    });
  } catch (error) {
    console.error("PATCH /:organizationId/relationship error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update relationship",
    });
  }
});

// ======================================
// GET ORGANIZATIONS BY STATUS
// List organizations for an audience, filterable by status
// ======================================

router.get("/by-status/:audienceId", async (req, res) => {
  try {
    const { audienceId } = req.params;
    const { status, limit = "25", page = "1" } = req.query;

    // Validate audience ID format
    if (!audienceId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
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

    // Validate status filter if provided
    const validStatuses = [
      "new",
      "reviewing",
      "qualified",
      "partner",
      "customer",
      "rejected",
    ];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status filter. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Parse pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    if (isNaN(pageNum) || isNaN(limitNum)) {
      return res.status(400).json({
        success: false,
        error: "page and limit must be numeric",
      });
    }

    // Build filter
    const filter = { audienceId };
    if (status) {
      filter.status = status;
    }

    const skip = (pageNum - 1) * limitNum;

    // Query relationships
    const [relationships, totalResults] = await Promise.all([
      OrganizationRelationship.find(filter)
        .sort({ lastChangedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OrganizationRelationship.countDocuments(filter),
    ]);

    // Get organization data
    const organizationIds = relationships.map((r) => r.organizationId);
    const organizations = await Organization.find({
      _id: { $in: organizationIds },
    })
      .select(
        "_id name domain industry employeeCount location priorityScore priorityTier audienceScore audienceTier",
      )
      .lean();

    const organizationMap = Object.fromEntries(
      organizations.map((o) => [o._id.toString(), o]),
    );

    // Enrich relationships with organization data
    const enriched = relationships.map((rel) => ({
      ...rel,
      organization: organizationMap[rel.organizationId.toString()] || null,
    }));

    // Calculate status distribution
    const allRelationships = await OrganizationRelationship.find({
      audienceId,
    }).lean();
    const statusDistribution = {};
    validStatuses.forEach((s) => {
      statusDistribution[s] = allRelationships.filter(
        (r) => r.status === s,
      ).length;
    });

    return res.json({
      success: true,
      audience: {
        _id: audience._id,
        name: audience.name,
      },
      filter: {
        status: status || null,
      },
      organizations: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
      summary: {
        total: allRelationships.length,
        byStatus: statusDistribution,
      },
    });
  } catch (error) {
    console.error("GET /by-status/:audienceId error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve organizations",
    });
  }
});

module.exports = router;
