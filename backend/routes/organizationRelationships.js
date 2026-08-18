const express = require("express");
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const Audience = require("../models/Audience");
const OrganizationRelationship = require("../models/OrganizationRelationship");
const Contact = require("../models/Contact");
const CrmActivity = require("../models/CrmActivity");
const { canonicalizeContactCompanies } = require("../services/companyCanonicalizationService");

const router = express.Router();

// Preview by default. Applying only creates canonical company accounts and
// links existing contacts; it never invokes discovery, enrichment, or AI.
router.post("/canonicalize-contacts", async (req, res) => {
  try {
    const data = await canonicalizeContactCompanies({ apply: req.body?.apply === true });
    res.json({ success: true, data });
  } catch (error) {
    console.error("POST /canonicalize-contacts error:", error);
    res.status(500).json({ success: false, error: "Failed to build companies from CRM contacts" });
  }
});

// CRM company index. Discovery owns finding organizations; this endpoint makes
// those same records usable as durable company accounts in the CRM.
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || "").trim().slice(0, 120);
    const priorityTier = String(req.query.priorityTier || "");
    const audienceTier = String(req.query.audienceTier || "");
    const relationshipStatus = String(req.query.relationshipStatus || "");
    const needsResearch = req.query.needsResearch === "true";
    const query = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = ["name", "domain", "industry", "location", "description"].map((field) => ({ [field]: { $regex: escaped, $options: "i" } }));
    }
    if (["hot", "warm", "cold"].includes(priorityTier)) query.priorityTier = priorityTier;
    if (["high", "medium", "low", "unscored"].includes(audienceTier)) query.audienceTier = audienceTier;
    if (needsResearch) {
      const missingProfile = ["domain", "industry", "location"].flatMap((field) => [
        { [field]: { $exists: false } },
        { [field]: "" },
        { [field]: null },
      ]);
      query.$and = [...(query.$and || []), { $or: missingProfile }];
    }
    if (["customer", "partner", "qualified", "prospect"].includes(relationshipStatus)) {
      const relationshipQuery = relationshipStatus === "prospect"
        ? { $or: [{ status: "new" }, { relationshipType: "prospect" }] }
        : { $or: [{ status: relationshipStatus }, { relationshipType: relationshipStatus }] };
      const matchingRelationships = await OrganizationRelationship.find(relationshipQuery).distinct("organizationId");
      query._id = { $in: matchingRelationships };
    }

    const [total, organizations] = await Promise.all([
      Organization.countDocuments(query),
      Organization.find(query).sort({ priorityScore: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    const ids = organizations.map((item) => item._id);
    const [contacts, relationships] = await Promise.all([
      Contact.find({ organizationId: { $in: ids }, status: { $ne: "archived" } }).select("organizationId").lean(),
      OrganizationRelationship.find({ organizationId: { $in: ids } }).select("organizationId status relationshipType lastChangedAt").lean(),
    ]);
    const contactCounts = contacts.reduce((map, item) => map.set(String(item.organizationId), (map.get(String(item.organizationId)) || 0) + 1), new Map());
    const relationshipMap = relationships.reduce((map, item) => {
      const key = String(item.organizationId);
      const current = map.get(key);
      if (!current || new Date(item.lastChangedAt || 0) > new Date(current.lastChangedAt || 0)) map.set(key, item);
      return map;
    }, new Map());

    res.json({
      success: true,
      data: organizations.map((organization) => ({ ...organization, contactCount: contactCounts.get(String(organization._id)) || 0, relationship: relationshipMap.get(String(organization._id)) || null })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to list companies" });
  }
});

router.get("/:organizationId", async (req, res, next) => {
  if (req.path.endsWith("/relationship")) return next();
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.organizationId)) return res.status(404).json({ success: false, error: "Company not found" });
    const organization = await Organization.findById(req.params.organizationId).lean();
    if (!organization) return res.status(404).json({ success: false, error: "Company not found" });
    const [contacts, relationships] = await Promise.all([
      Contact.find({ organizationId: organization._id, status: { $ne: "archived" } }).sort({ updatedAt: -1 }).lean(),
      OrganizationRelationship.find({ organizationId: organization._id }).populate("audienceId", "name").sort({ lastChangedAt: -1 }).lean(),
    ]);
    res.json({ success: true, data: { organization, contacts, relationships } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load company" });
  }
});

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
    await CrmActivity.create({
      organizationId: organization._id,
      type: "status_change",
      title: "Company relationship updated",
      body: `${audience.name}: ${oldStatus} → ${status}${notes ? `\n${notes}` : ""}`,
      source: "crm",
      createdBy: req.auth?.userId || null,
    });

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
