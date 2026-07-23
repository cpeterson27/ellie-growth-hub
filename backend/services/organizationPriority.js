/**
 * Organization Prioritization Service
 *
 * Calculates priority scores for organizations based on multiple signals:
 * - Audience fit (40 points)
 * - Industry match (15 points)
 * - Company size fit (15 points)
 * - Keyword match (10 points)
 * - Data quality (10 points)
 * - Recency (10 points)
 *
 * Priority is different from audienceScore:
 * - audienceScore: "How well does this org match the audience definition?"
 * - priorityScore: "How important should Ellie consider this org right now?"
 */

// =========================================================================
// SIGNAL CALCULATION HELPERS
// =========================================================================

/**
 * Calculate audience fit signal (0-40 points).
 * Based on organization's audienceScore.
 */
function calculateAudienceFitSignal(organization) {
  const score = organization.audienceScore || 0;

  if (score >= 90) return 40;
  if (score >= 70) return 30;
  if (score >= 50) return 20;
  return 0;
}

/**
 * Calculate industry match signal (0-15 points).
 * Compare organization industry against audience criteria.
 */
function calculateIndustryMatchSignal(organization, audience) {
  const orgIndustry = (organization.industry || "").toLowerCase().trim();
  if (!orgIndustry) return 0;

  const audienceIndustries = audience.criteria?.industries || [];
  if (audienceIndustries.length === 0) return 0;

  // Exact match: 15 points
  const exactMatch = audienceIndustries.some(
    (industry) => industry.toLowerCase().trim() === orgIndustry,
  );
  if (exactMatch) return 15;

  // Partial match: 5-10 points (substring match)
  const partialMatch = audienceIndustries.some((industry) => {
    const audienceIndLower = industry.toLowerCase().trim();
    return (
      orgIndustry.includes(audienceIndLower) ||
      audienceIndLower.includes(orgIndustry)
    );
  });
  if (partialMatch) return 8;

  // No match
  return 0;
}

/**
 * Calculate company size fit signal (0-15 points).
 * Compare organization employee count against audience criteria.
 */
function calculateCompanySizeSignal(organization, audience) {
  const empCount = organization.employeeCount;
  if (empCount === null || empCount === undefined) return 0;

  const range = audience.criteria?.employeeRange || {};
  const minEmp = range.min || null;
  const maxEmp = range.max || null;

  // If no range specified, assume any known size is valuable
  if (minEmp === null && maxEmp === null) return 5;

  // Check if in ideal range
  const inRange =
    (minEmp === null || empCount >= minEmp) &&
    (maxEmp === null || empCount <= maxEmp);
  if (inRange) return 15;

  // Known but outside range
  return 5;
}

/**
 * Calculate keyword match signal (0-10 points).
 * Compare organization keywords against audience criteria.
 */
function calculateKeywordMatchSignal(organization, audience) {
  const orgKeywords = organization.keywords || [];
  const audienceKeywords = audience.criteria?.keywords || [];

  if (orgKeywords.length === 0 || audienceKeywords.length === 0) return 0;

  const orgKeywordsLower = orgKeywords.map((k) => k.toLowerCase().trim());
  const audienceKeywordsLower = audienceKeywords.map((k) =>
    k.toLowerCase().trim(),
  );

  // Count matches
  const matches = orgKeywordsLower.filter((keyword) =>
    audienceKeywordsLower.includes(keyword),
  ).length;

  // Award based on match count
  if (matches >= 3) return 10;
  if (matches === 2) return 7;
  if (matches === 1) return 4;

  return 0;
}

/**
 * Calculate data quality signal (0-10 points).
 * Based on enrichment completeness.
 */
function calculateDataQualitySignal(organization) {
  let points = 0;

  if (organization.website && organization.website.trim()) points += 2;
  if (organization.linkedinUrl && organization.linkedinUrl.trim()) points += 3;
  if (organization.phone && organization.phone.trim()) points += 2;
  if (organization.description && organization.description.trim().length > 100)
    points += 3;

  return Math.min(points, 10);
}

/**
 * Calculate recency signal (0-10 points).
 * Recent discoveries score higher.
 */
function calculateRecencySignal(organization) {
  const discoveredAt = organization.discoveredAt;
  if (!discoveredAt) return 0;

  const daysSinceDiscovery = Math.floor(
    (Date.now() - discoveredAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Recent (0-7 days): 10 points
  if (daysSinceDiscovery <= 7) return 10;

  // Medium (7-30 days): 6-9 points
  if (daysSinceDiscovery <= 30) {
    return Math.max(9 - Math.floor((daysSinceDiscovery - 7) / 3), 6);
  }

  // Stale (30-90 days): 2-5 points
  if (daysSinceDiscovery <= 90) {
    return Math.max(5 - Math.floor((daysSinceDiscovery - 30) / 15), 2);
  }

  // Very stale (90+ days): 0-2 points
  return 0;
}

// =========================================================================
// PRIMARY FUNCTIONS
// =========================================================================

/**
 * Calculate priority score and signals for an organization.
 *
 * Returns:
 * {
 *   score: 0-100,
 *   tier: 'hot'|'warm'|'cold',
 *   signals: {
 *     audienceFit,
 *     industryMatch,
 *     companySize,
 *     keywordMatch,
 *     dataQuality,
 *     recency
 *   },
 *   reasons: [strings]
 * }
 */
function calculatePriorityScore(organization, audience) {
  // Validate inputs
  if (!organization) throw new Error("Organization required");
  if (!audience) throw new Error("Audience required");

  // Calculate each signal
  const signals = {
    audienceFit: calculateAudienceFitSignal(organization),
    industryMatch: calculateIndustryMatchSignal(organization, audience),
    companySize: calculateCompanySizeSignal(organization, audience),
    keywordMatch: calculateKeywordMatchSignal(organization, audience),
    dataQuality: calculateDataQualitySignal(organization),
    recency: calculateRecencySignal(organization),
  };

  // Sum all signals to get total score
  const score =
    signals.audienceFit +
    signals.industryMatch +
    signals.companySize +
    signals.keywordMatch +
    signals.dataQuality +
    signals.recency;

  // Determine tier
  const tier = calculatePriorityTier(score);

  // Generate human-readable reasons
  const reasons = generatePriorityReasons(signals, organization, audience);

  return {
    score,
    tier,
    signals,
    reasons,
  };
}

/**
 * Convert priority score to tier.
 */
function calculatePriorityTier(score) {
  if (score >= 80) return "hot";
  if (score >= 50) return "warm";
  return "cold";
}

/**
 * Generate human-readable priority reasons.
 */
function generatePriorityReasons(signals, organization, audience) {
  const reasons = [];

  // Audience fit reason
  if (signals.audienceFit >= 30) {
    reasons.push("High audience fit score");
  } else if (signals.audienceFit >= 20) {
    reasons.push("Good audience fit score");
  } else if (signals.audienceFit > 0) {
    reasons.push("Moderate audience fit");
  }

  // Industry match reason
  if (signals.industryMatch >= 15) {
    reasons.push(`${organization.industry || "Industry"} industry match`);
  } else if (signals.industryMatch > 0) {
    reasons.push("Partial industry match");
  }

  // Company size reason
  if (signals.companySize >= 15) {
    reasons.push(
      `Ideal size (${organization.employeeCount} employees) for audience`,
    );
  } else if (signals.companySize > 0) {
    reasons.push("Known company size");
  }

  // Keyword match reason
  if (signals.keywordMatch >= 7) {
    const topKeywords = (organization.keywords || []).slice(0, 2).join(", ");
    if (topKeywords) {
      reasons.push(`Strong keyword overlap (${topKeywords})`);
    }
  } else if (signals.keywordMatch > 0) {
    reasons.push("Some keyword match");
  }

  // Data quality reason
  if (signals.dataQuality >= 8) {
    reasons.push("Complete company profile");
  } else if (signals.dataQuality >= 5) {
    reasons.push("Well-enriched profile");
  }

  // Recency reason
  if (signals.recency >= 10) {
    reasons.push("Recently discovered");
  } else if (signals.recency >= 6) {
    reasons.push("Moderately recent discovery");
  }

  return reasons;
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
  calculatePriorityScore,
  calculatePriorityTier,
  generatePriorityReasons,
  // Helpers (exported for testing)
  calculateAudienceFitSignal,
  calculateIndustryMatchSignal,
  calculateCompanySizeSignal,
  calculateKeywordMatchSignal,
  calculateDataQualitySignal,
  calculateRecencySignal,
};
