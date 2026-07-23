const { discoverAudience } = require("./apollo");
const { findCommunities } = require("./meetup");
const { searchOrganizations, enrichOrganization } = require("./apollo");
const Organization = require("../models/Organization");
const Audience = require("../models/Audience");
const DiscoveryRun = require("../models/DiscoveryRun");
const organizationRelationshipService = require("./organizationRelationship");

// ---------------------------------------------------------------------------
// Audience scoring — rule-based, no ML dependency.
// Returns { score: 0-100, tier: "high"|"medium"|"low"|"unscored", reasons: [] }
// ---------------------------------------------------------------------------

const REAL_ESTATE_INDUSTRIES = new Set([
  "real estate",
  "real estate investment trust",
  "real estate investment",
  "commercial real estate",
  "residential real estate",
]);

const HIGH_VALUE_KEYWORDS = [
  "multifamily",
  "apartment",
  "airbnb",
  "short-term rental",
  "syndication",
  "syndicator",
  "property management",
  "real estate investor",
  "real estate investment",
  "multifamily investor",
  "multifamily housing",
];

function scoreOrganization(org) {
  let score = 0;
  const reasons = [];

  // +40 — industry match
  const industry = (org.industry || "").toLowerCase();
  if (REAL_ESTATE_INDUSTRIES.has(industry)) {
    score += 40;
    reasons.push("Real estate industry");
  }

  // +10 each, max +30 — keyword overlap
  const orgKeywords = (org.keywords || []).map((k) => k.toLowerCase());
  const description = (org.description || "").toLowerCase();
  const searchableText = [...orgKeywords, description].join(" ");

  let keywordHits = 0;
  for (const kw of HIGH_VALUE_KEYWORDS) {
    if (searchableText.includes(kw) && keywordHits < 3) {
      score += 10;
      keywordHits++;
      reasons.push(`Keyword match: ${kw}`);
    }
  }

  // +20 — employee count in boutique/mid range (5–500)
  const ec = org.employeeCount;
  if (ec != null && ec >= 5 && ec <= 500) {
    score += 20;
    reasons.push("Target employee range (5–500)");
  }

  // +5 — has LinkedIn URL (signal of credibility / reachability)
  if (org.linkedinUrl) {
    score += 5;
    reasons.push("LinkedIn profile available");
  }

  // +5 — has description (signal of enrichment quality)
  if (org.description && org.description.length > 30) {
    score += 5;
    reasons.push("Organization description available");
  }

  score = Math.min(100, score);

  const tier =
    score >= 70
      ? "high"
      : score >= 40
        ? "medium"
        : score > 0
          ? "low"
          : "unscored";

  return { score, tier, reasons };
}

// ---------------------------------------------------------------------------
// Organization intelligence pipeline:
// search → enrich → score → upsert into MongoDB
// ---------------------------------------------------------------------------

/**
 * Discover, enrich, and save organizations for a given audience segment.
 *
 * @param {object} params
 * @param {string[]} params.keywords   - e.g. ["multifamily", "real estate"]
 * @param {string[]} [params.industries]
 * @param {number}   [params.page=1]
 * @param {number}   [params.perPage=10]
 *
 * Returns: { success, saved, skipped, failed, organizations }
 */
async function discoverAndSaveOrganizations({
  keywords = [],
  industries = [],
  page = 1,
  perPage = 10,
} = {}) {
  // Step 1 — Search
  const searchResult = await searchOrganizations({
    keywords,
    industries,
    page,
    perPage,
  });

  if (!searchResult.success) {
    return {
      success: false,
      error: searchResult.error || "Organization search failed",
      organizations: [],
    };
  }

  const stats = { saved: 0, skipped: 0, failed: 0 };
  const organizations = [];

  // Step 2 — Enrich → Score → Upsert (sequential to respect rate limits)
  for (const raw of searchResult.organizations) {
    try {
      // Extract domain from website URL
      let domain = null;
      if (raw.website) {
        try {
          domain = new URL(
            raw.website.startsWith("http")
              ? raw.website
              : `https://${raw.website}`,
          ).hostname.replace(/^www\./, "");
        } catch {
          domain = null;
        }
      }

      // Step 2a — Enrich (only if we have a domain)
      let enriched = raw;
      if (domain) {
        const enrichResult = await enrichOrganization({ domain });
        if (enrichResult.success && enrichResult.organization) {
          enriched = { ...raw, ...enrichResult.organization };
        }
      }

      // Step 2b — Score
      const { score, tier, reasons } = scoreOrganization(enriched);

      // Step 2c — Build document
      const now = new Date();
      const doc = {
        name: enriched.name,
        domain: domain || undefined,
        source: "apollo",
        apolloId: enriched.apolloId || null,
        externalSources: {
          apollo: {
            id: enriched.apolloId || null,
            enrichedAt: domain ? now : null,
          },
        },
        website: enriched.website || "",
        industry: enriched.industry || "",
        description: enriched.description || "",
        employeeCount: enriched.employeeCount || null,
        location: enriched.location || "",
        linkedinUrl: enriched.linkedinUrl || "",
        founded: enriched.founded || null,
        phone: enriched.phone || "",
        keywords: enriched.keywords || [],
        audienceScore: score,
        audienceTier: tier,
        scoreReasons: reasons,
        discoveredAt: now,
        enrichedAt: domain ? now : null,
      };

      // Step 2d — Upsert keyed on domain (if present) or apolloId
      const filter = domain ? { domain } : { apolloId: enriched.apolloId };

      const saved = await Organization.findOneAndUpdate(
        filter,
        { $set: doc },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      organizations.push(saved);
      stats.saved++;
    } catch (err) {
      console.error("[audience] save org error:", err.message);
      stats.failed++;
    }
  }

  return {
    success: true,
    total: searchResult.total,
    ...stats,
    organizations,
  };
}

// ---------------------------------------------------------------------------
// Legacy — preserved for existing route compatibility
// ---------------------------------------------------------------------------

async function discoverAudienceSources(query) {
  if (!query) {
    return { success: false, message: "Audience query required", results: [] };
  }

  const results = [];

  const apolloResults = await discoverAudience(query);
  if (apolloResults.success) results.push(...apolloResults.results);

  const meetupResults = await findCommunities(query);
  if (meetupResults.success) results.push(...meetupResults.results);

  return { success: true, results };
}

// ---------------------------------------------------------------------------
// Discovery orchestration for Audience definitions
// Discovers organizations matching audience criteria, scores them, saves to MongoDB,
// and updates the Audience document with linked organization IDs.
// ---------------------------------------------------------------------------

/**
 * Discover and save organizations for a given Audience.
 * Creates a DiscoveryRun record to track execution metrics and history.
 *
 * Flow:
 *   1. Fetch Audience document
 *   2. Validate status (draft/active only; reject archived)
 *   3. Extract criteria (keywords, industries, locations, employeeRange, minScore, targetTier)
 *   4. Search Apollo for organizations (capped at 500)
 *   5. For each result: enrich, score, upsert to MongoDB
 *   6. Filter by minimumScore and targetTier
 *   7. Create DiscoveryRun with full execution metrics
 *   8. Update Audience.organizationIds (cumulative), lastDiscoveredAt, totalOrgs
 *   9. Return summary metrics + discoveryRunId
 *
 * @param {string} audienceId - MongoDB ObjectId of Audience document
 * @returns {object} { success, audienceId, discoveryRunId, organizationsFound, organizationsCreated, organizationsUpdated, duplicatesSkipped, completedAt, audience?, error? }
 */
async function discoverOrganizationsForAudience(audienceId) {
  const startedAt = new Date();

  try {
    // Step 1: Fetch Audience
    const audience = await Audience.findById(audienceId);
    if (!audience) {
      return { success: false, error: "Audience not found" };
    }

    // Step 2: Validate status (allow draft/active, block archived)
    if (audience.status === "archived") {
      return {
        success: false,
        error: "Cannot discover for archived audiences",
      };
    }

    // Initialize tracking for DiscoveryRun
    const stats = {
      organizationsFound: 0,
      organizationsCreated: 0,
      organizationsUpdated: 0,
      duplicatesSkipped: 0,
      enrichmentFailed: 0,
      persistenceFailed: 0,
    };

    const scoreDistribution = {
      high: 0,
      medium: 0,
      low: 0,
      unscored: 0,
    };

    const pagination = {
      totalPages: 0,
      availableOrganizationsFromSearch: 0,
      stoppedReason: null,
    };

    const discoveryErrors = {
      enrichmentRateLimitHit: false,
      enrichmentErrorCount: 0,
      message: "",
    };

    const newOrganizationIds = [];
    const discoveredOrgs = [];

    // Step 3: Extract criteria
    const criteria = audience.criteria || {};
    const keywords = criteria.keywords || [];
    const industries = criteria.industries || [];
    const locations = criteria.locations || [];
    const employeeRange = criteria.employeeRange || { min: null, max: null };
    const minimumScore = criteria.minimumScore ?? 0;
    const targetTier = criteria.targetTier ?? null;

    if (keywords.length === 0 && industries.length === 0) {
      return {
        success: false,
        error: "Audience criteria must have at least keywords or industries",
      };
    }

    // Step 4: Search Apollo (paginate, max 500 organizations)
    // Note: Apollo API only supports either keywords OR industries, not both.
    // Strategy: Combine industries into keywords if both are provided.
    const maxOrgs = 500;
    const perPage = 25;
    const maxPages = Math.ceil(maxOrgs / perPage);

    const searchKeywords = [
      ...keywords,
      ...(industries.length > 0 && keywords.length > 0 ? industries : []),
    ];
    const searchIndustries =
      keywords.length === 0 && industries.length > 0 ? industries : [];

    let allSearchResults = [];
    let totalAvailableFromApollo = 0;

    for (let page = 1; page <= maxPages; page++) {
      const searchResult = await searchOrganizations({
        keywords: searchKeywords,
        industries: searchIndustries,
        page,
        perPage,
      });

      if (!searchResult.success || !searchResult.organizations) {
        pagination.stoppedReason = "error";
        break;
      }

      if (page === 1) {
        totalAvailableFromApollo = searchResult.total || 0;
      }

      pagination.totalPages = page;
      allSearchResults.push(...searchResult.organizations);
      stats.organizationsFound += searchResult.organizations.length;

      // Stop if we've reached max or got fewer than perPage (no more results)
      if (
        allSearchResults.length >= maxOrgs ||
        searchResult.organizations.length < perPage
      ) {
        if (allSearchResults.length >= maxOrgs) {
          pagination.stoppedReason = "max_cap_reached";
        } else {
          pagination.stoppedReason = "no_more_results";
        }
        break;
      }
    }

    pagination.availableOrganizationsFromSearch = totalAvailableFromApollo;

    // Cap at 500
    allSearchResults = allSearchResults.slice(0, maxOrgs);

    // Step 5 & 6: Enrich → Score → Filter → Upsert (sequential to respect rate limits)
    const seenDomains = new Set();
    const seenApolloIds = new Set();

    for (const raw of allSearchResults) {
      try {
        // Extract domain
        let domain = null;
        if (raw.website) {
          try {
            domain = new URL(
              raw.website.startsWith("http")
                ? raw.website
                : `https://${raw.website}`,
            ).hostname.replace(/^www\./, "");
          } catch {
            domain = null;
          }
        }

        // Skip if duplicate domain or Apollo ID in this run
        if (domain && seenDomains.has(domain)) {
          stats.duplicatesSkipped++;
          continue;
        }
        if (raw.apolloId && seenApolloIds.has(raw.apolloId)) {
          stats.duplicatesSkipped++;
          continue;
        }
        if (domain) seenDomains.add(domain);
        if (raw.apolloId) seenApolloIds.add(raw.apolloId);

        // Enrich
        let enriched = raw;
        let enrichmentErrored = false;
        if (domain) {
          const enrichResult = await enrichOrganization({ domain });
          if (!enrichResult.success) {
            stats.enrichmentFailed++;
            discoveryErrors.enrichmentErrorCount++;
            // Check for rate limit error
            if (
              enrichResult.error &&
              enrichResult.error.includes("maximum number of api calls")
            ) {
              discoveryErrors.enrichmentRateLimitHit = true;
              pagination.stoppedReason = "rate_limited";
            }
            enrichmentErrored = true;
          } else if (enrichResult.organization) {
            enriched = { ...raw, ...enrichResult.organization };
          }
        }

        // Score
        const { score, tier, reasons } = scoreOrganization(enriched);

        // Filter: minimumScore and targetTier
        if (score < minimumScore) {
          continue;
        }

        if (targetTier) {
          const tierHierarchy = { high: 3, medium: 2, low: 1, unscored: 0 };
          const targetTierValue = tierHierarchy[targetTier] ?? -1;
          const orgTierValue = tierHierarchy[tier] ?? -1;
          if (orgTierValue < targetTierValue) {
            continue;
          }
        }

        // Track score distribution
        scoreDistribution[tier]++;

        // Build document
        const now = new Date();
        const doc = {
          name: enriched.name,
          domain: domain || undefined,
          source: "apollo",
          apolloId: enriched.apolloId || null,
          externalSources: {
            apollo: {
              id: enriched.apolloId || null,
              enrichedAt: domain && !enrichmentErrored ? now : null,
            },
          },
          website: enriched.website || "",
          industry: enriched.industry || "",
          description: enriched.description || "",
          employeeCount: enriched.employeeCount || null,
          location: enriched.location || "",
          linkedinUrl: enriched.linkedinUrl || "",
          founded: enriched.founded || null,
          phone: enriched.phone || "",
          keywords: enriched.keywords || [],
          audienceScore: score,
          priorityScore: score,
          audienceTier: tier,
          scoreReasons: reasons,
          discoveredAt: now,
          enrichedAt: domain && !enrichmentErrored ? now : null,
        };

        // Upsert
        const filter = domain ? { domain } : { apolloId: enriched.apolloId };
        const existingOrg = await Organization.findOne(filter);
        const isNew = !existingOrg;

        let savedOrg;
        try {
          savedOrg = await Organization.findOneAndUpdate(
            filter,
            { $set: doc },
            {
              upsert: true,
              returnDocument: "after",
              setDefaultsOnInsert: true,
            },
          );

          if (isNew) {
            stats.organizationsCreated++;
          } else {
            stats.organizationsUpdated++;
          }

          newOrganizationIds.push(savedOrg._id);
          discoveredOrgs.push(savedOrg);
        } catch (persistErr) {
          console.error(
            "[audience] org persistence error:",
            persistErr.message,
          );
          stats.persistenceFailed++;
        }
      } catch (err) {
        console.error("[audience] org discovery error:", err.message);
        stats.persistenceFailed++;
      }
    }

    // Step 7: Create DiscoveryRun record
    const completedAt = new Date();
    let discoveryStatus = "success";

    if (
      discoveryErrors.enrichmentRateLimitHit ||
      discoveryErrors.enrichmentErrorCount > 0
    ) {
      discoveryStatus = "partial";
    }

    if (
      stats.organizationsCreated === 0 &&
      stats.organizationsUpdated === 0 &&
      allSearchResults.length > 0
    ) {
      discoveryStatus = "partial";
    }

    const discoveryRun = await DiscoveryRun.create({
      audienceId,
      status: discoveryStatus,
      criteriaSnapshot: {
        keywords,
        industries,
        locations,
        employeeRange,
        minimumScore,
        targetTier,
      },
      statistics: stats,
      organizationIds: newOrganizationIds,
      scoreDistribution,
      pagination,
      errorDetails: discoveryErrors,
      startedAt,
      completedAt,
    });

    // Step 8: Update Audience document
    const updatedAudience = await Audience.findByIdAndUpdate(
      audienceId,
      {
        $addToSet: { organizationIds: { $each: newOrganizationIds } },
        lastDiscoveredAt: completedAt,
        totalOrgs:
          newOrganizationIds.length + (audience.organizationIds?.length ?? 0),
      },
      { returnDocument: "after" },
    );

    // Step 9: Create organization relationships
    // Automatically create "new" status relationships for newly discovered orgs
    let relationshipsCreated = 0;
    try {
      const relationshipStats =
        await organizationRelationshipService.bulkCreateRelationships(
          newOrganizationIds,
          audienceId,
        );
      relationshipsCreated = relationshipStats.created;
    } catch (relErr) {
      console.warn(
        "[audience] Failed to create relationships:",
        relErr.message,
      );
      // Don't fail the discovery if relationship creation fails
      // Relationships can be created manually or through a remediation task
    }

    // Step 10: Return response with discoveryRunId
    return {
      success: true,
      audienceId,
      discoveryRunId: discoveryRun._id.toString(),
      organizationsFound: stats.organizationsFound,
      organizationsCreated: stats.organizationsCreated,
      organizationsUpdated: stats.organizationsUpdated,
      duplicatesSkipped: stats.duplicatesSkipped,
      relationshipsCreated,
      completedAt,
      audience: updatedAudience,
    };
  } catch (err) {
    console.error("[audience] discoverOrganizationsForAudience error:", err);
    return {
      success: false,
      error: err.message || "Organization discovery failed",
    };
  }
}

module.exports = {
  discoverAudienceSources,
  discoverAndSaveOrganizations,
  discoverOrganizationsForAudience,
  scoreOrganization,
};
