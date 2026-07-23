const express = require("express");

const Contact = require("../models/Contact");
const Organization = require("../models/Organization");
const Audience = require("../models/Audience");
const DiscoveryRun = require("../models/DiscoveryRun");

const {
  discoverAudienceSources,
  discoverOrganizationsForAudience,
} = require("../services/audience");

const router = express.Router();

// ===================================================================
// AUDIENCE CRUD ROUTES
// ===================================================================

// ======================================
// LIST AUDIENCES
// ======================================

router.get("/", async (req, res) => {
  try {
    const {
      status,
      source,
      sort = "recent",
      page = "1",
      limit = "25",
    } = req.query;

    const filter = {};

    if (status) {
      const validStatuses = ["draft", "active", "archived"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }
      filter.status = status;
    }

    if (source) {
      const validSources = ["manual", "ai", "import"];
      if (!validSources.includes(source)) {
        return res.status(400).json({
          success: false,
          error: `Invalid source. Must be one of: ${validSources.join(", ")}`,
        });
      }
      filter.source = source;
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    // Sort (newest first by default)
    const sortMap = {
      recent: { createdAt: -1 },
      name: { name: 1 },
    };
    const sortOrder = sortMap[sort] || sortMap.recent;

    const [audiences, totalResults] = await Promise.all([
      Audience.find(filter)
        .select(
          "name status source totalOrgs lastDiscoveredAt createdAt updatedAt",
        )
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Audience.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      audiences,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET / error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve audiences",
    });
  }
});

// ======================================
// GET AUDIENCE DETAILS
// ======================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const audience = await Audience.findById(id).lean();

    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Get latest DiscoveryRun
    const latestDiscoveryRun = await DiscoveryRun.findOne({ audienceId: id })
      .sort({ createdAt: -1 })
      .select(
  "status statistics scoreDistribution completedAt startedAt errorDetails pagination",
      )
      .lean();

    return res.json({
      success: true,
      audience: {
        ...audience,
        organizationIdsCount: audience.organizationIds?.length || 0,
      },
      latestDiscoveryRun: latestDiscoveryRun || null,
    });
  } catch (error) {
    console.error("GET /:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve audience",
    });
  }
});

// ======================================
// CREATE AUDIENCE
// ======================================

router.post("/", async (req, res) => {
  try {
    const {
      name,
      description,
      status = "draft",
      source = "manual",
      criteria,
    } = req.body;

    // Validate name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "name is required and must be a non-empty string",
      });
    }

    // Validate status
    const validStatuses = ["draft", "active", "archived"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Validate source
    const validSources = ["manual", "ai", "import"];
    if (source && !validSources.includes(source)) {
      return res.status(400).json({
        success: false,
        error: `Invalid source. Must be one of: ${validSources.join(", ")}`,
      });
    }

    // Validate criteria if provided
    if (criteria) {
      if (criteria.minimumScore !== undefined) {
        const score = Number(criteria.minimumScore);
        if (isNaN(score) || score < 0 || score > 100) {
          return res.status(400).json({
            success: false,
            error: "criteria.minimumScore must be a number between 0 and 100",
          });
        }
      }

      if (criteria.targetTier !== undefined && criteria.targetTier !== null) {
        const validTiers = ["high", "medium", "low", "unscored"];
        if (!validTiers.includes(criteria.targetTier)) {
          return res.status(400).json({
            success: false,
            error: `Invalid criteria.targetTier. Must be one of: ${validTiers.join(", ")}, or null`,
          });
        }
      }

      if (criteria.employeeRange) {
        const { min, max } = criteria.employeeRange;
        if (min !== null && max !== null && min > max) {
          return res.status(400).json({
            success: false,
            error: "criteria.employeeRange.min must be <= max",
          });
        }
      }
    }

    const audience = await Audience.create({
      name: name.trim(),
      description: description ? description.trim() : "",
      status,
      source,
      criteria: criteria || {
        keywords: [],
        industries: [],
        locations: [],
        employeeRange: { min: null, max: null },
        minimumScore: 0,
        targetTier: null,
      },
    });

    return res.status(201).json({
      success: true,
      audience: audience.toObject(),
    });
  } catch (error) {
    console.error("POST / error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create audience",
    });
  }
});

// ======================================
// UPDATE AUDIENCE
// ======================================

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, criteria } = req.body;

    const audience = await Audience.findById(id);

    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Do not allow updates to archived audiences
    if (audience.status === "archived") {
      return res.status(400).json({
        success: false,
        error: "Cannot update archived audience",
      });
    }

    // Validate and update name
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "name must be a non-empty string",
        });
      }
      audience.name = name.trim();
    }

    // Update description
    if (description !== undefined) {
      audience.description = description ? description.trim() : "";
    }

    // Validate and update status
    if (status !== undefined) {
      const validStatuses = ["draft", "active", "archived"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }
      audience.status = status;
    }

    // Validate and update criteria
    if (criteria !== undefined) {
      if (criteria.minimumScore !== undefined) {
        const score = Number(criteria.minimumScore);
        if (isNaN(score) || score < 0 || score > 100) {
          return res.status(400).json({
            success: false,
            error: "criteria.minimumScore must be a number between 0 and 100",
          });
        }
        audience.criteria.minimumScore = score;
      }

      if (criteria.targetTier !== undefined) {
        if (criteria.targetTier !== null) {
          const validTiers = ["high", "medium", "low", "unscored"];
          if (!validTiers.includes(criteria.targetTier)) {
            return res.status(400).json({
              success: false,
              error: `Invalid criteria.targetTier. Must be one of: ${validTiers.join(", ")}, or null`,
            });
          }
        }
        audience.criteria.targetTier = criteria.targetTier;
      }

      if (criteria.keywords !== undefined) {
        if (!Array.isArray(criteria.keywords)) {
          return res.status(400).json({
            success: false,
            error: "criteria.keywords must be an array",
          });
        }
        audience.criteria.keywords = criteria.keywords;
      }

      if (criteria.industries !== undefined) {
        if (!Array.isArray(criteria.industries)) {
          return res.status(400).json({
            success: false,
            error: "criteria.industries must be an array",
          });
        }
        audience.criteria.industries = criteria.industries;
      }

      if (criteria.locations !== undefined) {
        if (!Array.isArray(criteria.locations)) {
          return res.status(400).json({
            success: false,
            error: "criteria.locations must be an array",
          });
        }
        audience.criteria.locations = criteria.locations;
      }

      if (criteria.employeeRange !== undefined) {
        const { min, max } = criteria.employeeRange;
        if (min !== null && max !== null && min > max) {
          return res.status(400).json({
            success: false,
            error: "criteria.employeeRange.min must be <= max",
          });
        }
        audience.criteria.employeeRange = criteria.employeeRange;
      }
    }

    await audience.save();

    return res.json({
      success: true,
      audience: audience.toObject(),
    });
  } catch (error) {
    console.error("PATCH /:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update audience",
    });
  }
});

// ======================================
// ARCHIVE AUDIENCE
// ======================================

router.patch("/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;

    const audience = await Audience.findById(id);

    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    if (audience.status === "archived") {
      return res.status(400).json({
        success: false,
        error: "Audience is already archived",
      });
    }

    audience.status = "archived";
    await audience.save();

    return res.json({
      success: true,
      message: "Audience archived successfully",
      audience: audience.toObject(),
    });
  } catch (error) {
    console.error("PATCH /:id/archive error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to archive audience",
    });
  }
});

// ===================================================================
// ANALYTICS ROUTES (READ-ONLY)
// ===================================================================

// ======================================
// GET AUDIENCE ANALYTICS SUMMARY
// Dashboard view: performance, quality, latest run
// ======================================

router.get("/:id/analytics", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Get all discovery runs for this audience
    const runs = await DiscoveryRun.find({ audienceId: id })
      .select(
  "status statistics scoreDistribution startedAt completedAt errorDetails",
      )
      .sort({ completedAt: -1 })
      .lean();

    // Aggregate run statistics
    const summary = {
      totalRuns: runs.length,
      successfulRuns: 0,
      partialRuns: 0,
      failedRuns: 0,
      totalOrganizationsFound: 0,
      totalOrganizationsCreated: 0,
      totalOrganizationsUpdated: 0,
    };

    runs.forEach((run) => {
      if (run.status === "success") summary.successfulRuns += 1;
      if (run.status === "partial") summary.partialRuns += 1;
      if (run.status === "failed") summary.failedRuns += 1;

      if (run.statistics) {
        summary.totalOrganizationsFound +=
          run.statistics.organizationsFound || 0;
        summary.totalOrganizationsCreated +=
          run.statistics.organizationsCreated || 0;
        summary.totalOrganizationsUpdated +=
          run.statistics.organizationsUpdated || 0;
      }
    });

    // Get organizations for this audience
    const organizations = await Organization.find({
      _id: { $in: audience.organizationIds || [] },
    })
      .select("audienceScore audienceTier")
      .lean();

    // Calculate quality metrics
    let totalScore = 0;
    const tierCounts = {
      high: 0,
      medium: 0,
      low: 0,
      unscored: 0,
    };

    organizations.forEach((org) => {
      totalScore += org.audienceScore || 0;
      tierCounts[org.audienceTier] = (tierCounts[org.audienceTier] || 0) + 1;
    });

    const quality = {
      averageScore:
        organizations.length > 0
          ? Math.round((totalScore / organizations.length) * 10) / 10
          : 0,
      highTierOrganizations: tierCounts.high,
      mediumTierOrganizations: tierCounts.medium,
      lowTierOrganizations: tierCounts.low,
      unscoredOrganizations: tierCounts.unscored,
    };

    // Format latest run
    const latestRun = runs.length > 0 ? runs[0] : null;
    const latestRunSummary = latestRun
      ? {
          id: latestRun._id,
          status: latestRun.status,
          startedAt: latestRun.startedAt,
          completedAt: latestRun.completedAt,
          organizationsCreated: latestRun.statistics?.organizationsCreated || 0,
          scoreDistribution: latestRun.scoreDistribution || {
            high: 0,
            medium: 0,
            low: 0,
            unscored: 0,
          },
        }
      : null;

    return res.json({
      success: true,
      analytics: {
        audienceId: audience._id,
        audienceName: audience.name,
        summary,
        quality,
        latestRun: latestRunSummary,
      },
    });
  } catch (error) {
    console.error("GET /:id/analytics error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve analytics",
    });
  }
});

// ======================================
// GET DISCOVERY RUN HISTORY
// List all discovery runs with pagination
// ======================================

router.get("/:id/runs", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = "1", limit = "25", status } = req.query;

    // Validate ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate status filter
    const validStatuses = ["success", "partial", "failed"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    if (isNaN(pageNum) || isNaN(limitNum)) {
      return res.status(400).json({
        success: false,
        error: "page and limit must be numeric",
      });
    }

    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = { audienceId: id };
    if (status) {
      filter.status = status;
    }

    // Query runs (newest first)
    const [runs, totalResults] = await Promise.all([
      DiscoveryRun.find(filter)
        .select(
  "status startedAt completedAt statistics scoreDistribution errorDetails pagination criteriaSnapshot",
        )
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DiscoveryRun.countDocuments(filter),
    ]);

    // Format runs with computed duration
    const formattedRuns = runs.map((run) => {
      const duration =
        run.completedAt && run.startedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : 0;

      return {
        id: run._id,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs: duration,
        statistics: run.statistics || {},
        scoreDistribution: run.scoreDistribution || {
          high: 0,
          medium: 0,
          low: 0,
          unscored: 0,
        },
        pagination: run.pagination || {},
errorDetails: run.errorDetails || {},      };
    });

    return res.json({
      success: true,
      runs: formattedRuns,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /:id/runs error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve discovery runs",
    });
  }
});

// ======================================
// GET ORGANIZATION INSIGHTS FOR AUDIENCE
// Analytics on discovered organizations
// ======================================

router.get("/:id/organizations/summary", async (req, res) => {
  try {
    const { id } = req.params;
    const { top = "5" } = req.query;

    // Validate ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate top parameter
    const topNum = parseInt(top, 10);
    if (isNaN(topNum) || topNum < 1 || topNum > 100) {
      return res.status(400).json({
        success: false,
        error: "top must be numeric between 1 and 100",
      });
    }

    // Get organizations for this audience
    const organizations = await Organization.find({
      _id: { $in: audience.organizationIds || [] },
    })
      .select(
        "name audienceScore audienceTier industry location employeeCount keywords",
      )
      .lean();

    // Calculate score distribution and metrics
    let totalScore = 0;
    const tierCounts = {
      high: 0,
      medium: 0,
      low: 0,
      unscored: 0,
    };
    const industryCounts = {};
    const locationCounts = {};
    const employeeSizeCounts = {
      small: 0,
      medium: 0,
      large: 0,
    };

    organizations.forEach((org) => {
      // Score and tier
      totalScore += org.audienceScore || 0;
      tierCounts[org.audienceTier] = (tierCounts[org.audienceTier] || 0) + 1;

      // Industry
      if (org.industry) {
        industryCounts[org.industry] = (industryCounts[org.industry] || 0) + 1;
      }

      // Location
      if (org.location) {
        locationCounts[org.location] = (locationCounts[org.location] || 0) + 1;
      }

      // Employee size
      const count = org.employeeCount || 0;
      if (count <= 50) {
        employeeSizeCounts.small += 1;
      } else if (count <= 500) {
        employeeSizeCounts.medium += 1;
      } else {
        employeeSizeCounts.large += 1;
      }
    });

    // Sort and limit top industries
    const topIndustries = Object.entries(industryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topNum)
      .map(([industry, count]) => ({
        industry,
        count,
      }));

    // Sort and limit top locations
    const topLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topNum)
      .map(([location, count]) => ({
        location,
        count,
      }));

    // Get top scoring organizations
    const topOrganizations = organizations
      .sort((a, b) => (b.audienceScore || 0) - (a.audienceScore || 0))
      .slice(0, topNum)
      .map((org) => ({
        name: org.name,
        score: org.audienceScore || 0,
        tier: org.audienceTier,
        industry: org.industry || "Unknown",
      }));

    return res.json({
      success: true,
      organizationSummary: {
        totalOrganizations: organizations.length,
        scoreDistribution: tierCounts,
        averageScore:
          organizations.length > 0
            ? Math.round((totalScore / organizations.length) * 10) / 10
            : 0,
      },
      topIndustries,
      topLocations,
      employeeSizeBreakdown: employeeSizeCounts,
      topOrganizations,
    });
  } catch (error) {
    console.error("GET /:id/organizations/summary error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve organization summary",
    });
  }
});

// ===================================================================
// DISCOVERY & ORGANIZATION ROUTES (EXISTING)
// ===================================================================

// ======================================
// GET SAVED ORGANIZATIONS
// Query saved orgs by tier, score, source,
// industry, or location.
// ======================================

router.get("/organizations", async (req, res) => {
  try {
    const {
      tier,
      minScore,
      source,
      industry,
      location,
      sort = "score",
      page = "1",
      limit = "25",
    } = req.query;

    const filter = {};

    if (tier) {
      const validTiers = ["high", "medium", "low", "unscored"];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({
          error: `Invalid tier. Must be one of: ${validTiers.join(", ")}`,
        });
      }
      filter.audienceTier = tier;
    }

    if (minScore !== undefined) {
      const parsed = Number(minScore);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        return res
          .status(400)
          .json({ error: "minScore must be a number between 0 and 100" });
      }
      filter.audienceScore = { $gte: parsed };
    }

    if (source) filter.source = source;

    if (industry) {
      filter.industry = { $regex: industry, $options: "i" };
    }

    if (location) {
      filter.location = { $regex: location, $options: "i" };
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sortMap = {
      score: { audienceScore: -1 },
      name: { name: 1 },
      recent: { createdAt: -1 },
    };
    const sortOrder = sortMap[sort] || sortMap.score;

    const [organizations, totalResults] = await Promise.all([
      Organization.find(filter)
        .select(
          "name website industry employeeCount location audienceScore audienceTier scoreReasons domain source discoveredAt",
        )
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Organization.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      organizations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /organizations error:", error);
    return res.status(500).json({ error: "Failed to retrieve organizations" });
  }
});

// ======================================
// DISCOVER ORGANIZATIONS FOR AUDIENCE
// Triggers discovery flow for a given Audience:
// - Search Apollo (max 500 orgs)
// - Enrich each organization
// - Score and filter by criteria
// - Save/update to MongoDB
// - Link to Audience.organizationIds
// ======================================

router.post("/:id/discover", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Audience ID is required",
      });
    }

    const result = await discoverOrganizationsForAudience(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: result.success,
      audienceId: result.audienceId,
      discoveryRunId: result.discoveryRunId,
      organizationsFound: result.organizationsFound,
      organizationsCreated: result.organizationsCreated,
      organizationsUpdated: result.organizationsUpdated,
      duplicatesSkipped: result.duplicatesSkipped,
      completedAt: result.completedAt,
      audience: result.audience,
    });
  } catch (error) {
    console.error("POST /:id/discover error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to discover organizations for audience",
    });
  }
});

// ======================================
// DISCOVER AUDIENCE
// Apollo + Meetup + Future Sources
// ======================================

router.post("/discover", async (req, res) => {
  try {
    const { query, campaignId } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Audience query is required",
      });
    }

    const result = await discoverAudienceSources(query);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const contacts = [];

    for (const item of result.results) {
      // Prevent duplicate contacts
      const existing = await Contact.findOne({
        email: item.email || "",

        company: item.company || item.organization || "",
      });

      if (existing) {
        contacts.push(existing);

        continue;
      }

      const contact = await Contact.create({
        name: item.name || "",

        email: item.email || "",

        company: item.company || item.organization || "",

        role: item.role || item.contactRole || "",

        source: item.source || "manual",

        campaignId,

        tags: [query],

        status: "new",
      });

      contacts.push(contact);
    }

    res.json({
      success: true,

      contactsCreated: contacts.length,

      contacts,
    });
  } catch (error) {
    console.error("AUDIENCE DISCOVERY ERROR:", error);

    res.status(500).json({
      error: "Failed discovering audience",
    });
  }
});

// ===================================================================
// ORGANIZATION PRIORITIZATION RETRIEVAL ROUTES (READ-ONLY)
// ===================================================================

// ======================================
// GET PRIORITIZED ORGANIZATIONS FOR AUDIENCE
// Return organizations ranked by priorityScore
// with support for filtering by tier/score and sorting
// ======================================

router.get("/:id/organizations/prioritized", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = "1",
      limit = "25",
      tier,
      minScore,
      maxScore,
      sortBy = "priority",
    } = req.query;

    // Validate audience ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate audience exists
    const audience = await Audience.findById(id).lean();
    if (!audience) {
      return res.status(404).json({
        success: false,
        error: "Audience not found",
      });
    }

    // Validate and parse pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    if (isNaN(pageNum) || isNaN(limitNum)) {
      return res.status(400).json({
        success: false,
        error: "page and limit must be numeric",
      });
    }

    if (pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: "page must be >= 1",
      });
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: "limit must be between 1 and 100",
      });
    }

    // Validate tier filter
    const validTiers = ["hot", "warm", "cold"];
    if (tier && !validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier value. Must be one of: ${validTiers.join(", ")}`,
      });
    }

    // Validate score filters
    let minScoreNum = null;
    let maxScoreNum = null;

    if (minScore !== undefined) {
      minScoreNum = Number(minScore);
      if (isNaN(minScoreNum) || minScoreNum < 0 || minScoreNum > 100) {
        return res.status(400).json({
          success: false,
          error: "minScore must be between 0 and 100",
        });
      }
    }

    if (maxScore !== undefined) {
      maxScoreNum = Number(maxScore);
      if (isNaN(maxScoreNum) || maxScoreNum < 0 || maxScoreNum > 100) {
        return res.status(400).json({
          success: false,
          error: "maxScore must be between 0 and 100",
        });
      }
    }

    // Validate sortBy
    const validSortOptions = [
      "priority",
      "score_asc",
      "score_desc",
      "recent",
      "name",
    ];
    if (!validSortOptions.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sortBy. Must be one of: ${validSortOptions.join(", ")}`,
      });
    }

    // Build filter for organizations
    const filter = { _id: { $in: audience.organizationIds || [] } };

    if (tier) {
      filter.priorityTier = tier;
    }

    if (minScoreNum !== null || maxScoreNum !== null) {
      filter.priorityScore = {};
      if (minScoreNum !== null) {
        filter.priorityScore.$gte = minScoreNum;
      }
      if (maxScoreNum !== null) {
        filter.priorityScore.$lte = maxScoreNum;
      }
    }

    // Build sort order
    const sortMap = {
      priority: { priorityScore: -1 },
      score_asc: { priorityScore: 1 },
      score_desc: { priorityScore: -1 },
      recent: { discoveredAt: -1 },
      name: { name: 1 },
    };
    const sortOrder = sortMap[sortBy];

    // Calculate skip
    const skip = (pageNum - 1) * limitNum;

    // Query organizations
    const [organizations, totalResults] = await Promise.all([
      Organization.find(filter)
        .select(
          "name domain website industry employeeCount location linkedinUrl audienceScore audienceTier scoreReasons priorityScore priorityTier priorityReasons discoveredAt enrichedAt priorityCalculatedAt source keywords",
        )
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Organization.countDocuments(filter),
    ]);

    // Calculate tier counts and summary statistics
    let hotCount = 0;
    let warmCount = 0;
    let coldCount = 0;
    let totalPriorityScore = 0;

    const scoreDistribution = { "80-100": 0, "50-79": 0, "0-49": 0 };

    // Get all organizations for summary (not paginated)
    const allOrganizations = await Organization.find(filter)
      .select("priorityScore priorityTier")
      .lean();

    allOrganizations.forEach((org) => {
      const score = org.priorityScore || 0;
      totalPriorityScore += score;

      if (org.priorityTier === "hot") hotCount += 1;
      if (org.priorityTier === "warm") warmCount += 1;
      if (org.priorityTier === "cold") coldCount += 1;

      if (score >= 80) {
        scoreDistribution["80-100"] += 1;
      } else if (score >= 50) {
        scoreDistribution["50-79"] += 1;
      } else {
        scoreDistribution["0-49"] += 1;
      }
    });

    const averagePriorityScore =
      allOrganizations.length > 0
        ? Math.round((totalPriorityScore / allOrganizations.length) * 10) / 10
        : 0;

    return res.json({
      success: true,
      organizations,
      summary: {
        totalOrganizations: allOrganizations.length,
        byTier: {
          hot: hotCount,
          warm: warmCount,
          cold: coldCount,
        },
        averagePriorityScore,
        scoreDistribution,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalResults,
        totalPages: Math.ceil(totalResults / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /:id/organizations/prioritized error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve prioritized organizations",
    });
  }
});

// ======================================
// GET ORGANIZATION PRIORITY DETAILS
// Return single organization's priority breakdown
// ======================================

router.get("/organizations/:id/priority", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate organization ID format
    if (!id.match(/^[0-9a-f]{24}$/i)) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // Fetch organization
    const organization = await Organization.findById(id)
      .select(
        "name domain website industry employeeCount location linkedinUrl phone description audienceScore audienceTier scoreReasons priorityScore priorityTier priorityReasons prioritySignals priorityCalculatedAt discoveredAt enrichedAt source keywords",
      )
      .lean();

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    // Build detailed signal explanations
    const signals = organization.prioritySignals || {};
    const detailedSignals = {
      audienceFit: {
        points: signals.audienceFit || 0,
        explanation:
          signals.audienceFit >= 30
            ? "High audience fit"
            : signals.audienceFit >= 20
              ? "Good audience fit"
              : signals.audienceFit > 0
                ? "Moderate audience fit"
                : "Low audience fit",
        calculation: `audienceScore ${organization.audienceScore} → ${signals.audienceFit} points`,
      },
      industryMatch: {
        points: signals.industryMatch || 0,
        explanation:
          signals.industryMatch >= 15
            ? "Exact industry match"
            : signals.industryMatch > 0
              ? "Partial industry match"
              : "No industry match",
        calculation: `${organization.industry || "Unknown"} industry → ${signals.industryMatch} points`,
      },
      companySize: {
        points: signals.companySize || 0,
        explanation:
          signals.companySize >= 15
            ? "Ideal employee count"
            : signals.companySize > 0
              ? "Known employee count"
              : "Unknown employee count",
        calculation: `${organization.employeeCount || "Unknown"} employees → ${signals.companySize} points`,
      },
      keywordMatch: {
        points: signals.keywordMatch || 0,
        explanation:
          signals.keywordMatch >= 7
            ? "Strong keyword overlap"
            : signals.keywordMatch > 0
              ? "Some keyword match"
              : "No keyword match",
        calculation: `${(organization.keywords || []).length} keywords → ${signals.keywordMatch} points`,
      },
      dataQuality: {
        points: signals.dataQuality || 0,
        explanation:
          signals.dataQuality >= 8
            ? "Complete profile"
            : signals.dataQuality >= 5
              ? "Well-enriched profile"
              : "Minimal enrichment",
        calculation: `Profile completeness → ${signals.dataQuality} points`,
      },
      recency: {
        points: signals.recency || 0,
        explanation:
          signals.recency >= 10
            ? "Recently discovered"
            : signals.recency >= 6
              ? "Moderately recent"
              : signals.recency > 0
                ? "Older discovery"
                : "Very stale",
        calculation: `${
          organization.discoveredAt
            ? Math.floor(
                (Date.now() - new Date(organization.discoveredAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : "unknown"
        } days ago → ${signals.recency} points`,
      },
    };

    // Determine if recalculation recommended
    const recalculationRecommended =
      !organization.priorityCalculatedAt ||
      Date.now() - new Date(organization.priorityCalculatedAt).getTime() >
        30 * 24 * 60 * 60 * 1000; // 30 days

    return res.json({
      success: true,
      organization: {
        _id: organization._id,
        name: organization.name,
        domain: organization.domain,
        website: organization.website,
        industry: organization.industry,
        employeeCount: organization.employeeCount,
        location: organization.location,
        linkedinUrl: organization.linkedinUrl,
        phone: organization.phone,
        description: organization.description,
        audienceScore: organization.audienceScore,
        audienceTier: organization.audienceTier,
        scoreReasons: organization.scoreReasons,
        discoveredAt: organization.discoveredAt,
        enrichedAt: organization.enrichedAt,
        source: organization.source,
        keywords: organization.keywords,
      },
      priority: {
        score: organization.priorityScore || 0,
        tier: organization.priorityTier || "cold",
        reasons: organization.priorityReasons || [],
        signals: detailedSignals,
        calculatedAt: organization.priorityCalculatedAt,
        recalculationRecommended,
      },
    });
  } catch (error) {
    console.error("GET /organizations/:id/priority error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve organization priority details",
    });
  }
});

module.exports = router;
