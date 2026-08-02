const { findCommunities } = require("./meetup");
const Organization = require("../models/Organization");
const Audience = require("../models/Audience");
const DiscoveryRun = require("../models/DiscoveryRun");

const normalize = (value) => String(value || "").trim().toLowerCase();
const includesAny = (text, values = []) => values.some((value) => text.includes(normalize(value)));

function scoreOrganization(org, criteria = {}) {
  const searchable = [org.name, org.industry, org.description, ...(org.keywords || [])].map(normalize).join(" ");
  const location = normalize(org.location);
  let score = 0;
  const reasons = [];

  if (criteria.industries?.length && includesAny(searchable, criteria.industries)) {
    score += 35;
    reasons.push("Industry matches the research profile");
  }
  if (criteria.keywords?.length && includesAny(searchable, criteria.keywords)) {
    score += 35;
    reasons.push("Business signals match target keywords");
  }
  if (criteria.locations?.length && includesAny(location, criteria.locations)) {
    score += 20;
    reasons.push("Location matches the target market");
  }
  const count = Number(org.employeeCount);
  const min = criteria.employeeRange?.min;
  const max = criteria.employeeRange?.max;
  if (Number.isFinite(count) && (min == null || count >= min) && (max == null || count <= max)) {
    score += 10;
    reasons.push("Company size is in range");
  }
  if (!criteria.industries?.length && !criteria.keywords?.length && !criteria.locations?.length) score = 0;
  const tier = score >= 75 ? "high" : score >= 45 ? "medium" : score > 0 ? "low" : "unscored";
  return { score, tier, reasons };
}

function organizationMatches(org, criteria = {}) {
  const searchable = [org.name, org.industry, org.description, ...(org.keywords || [])].map(normalize).join(" ");
  const locations = criteria.locations || [];
  const industries = criteria.industries || [];
  const keywords = criteria.keywords || [];
  const employeeCount = Number(org.employeeCount);
  const min = criteria.employeeRange?.min;
  const max = criteria.employeeRange?.max;
  return (!industries.length || includesAny(searchable, industries))
    && (!keywords.length || includesAny(searchable, keywords))
    && (!locations.length || includesAny(normalize(org.location), locations))
    && (min == null || (Number.isFinite(employeeCount) && employeeCount >= min))
    && (max == null || (Number.isFinite(employeeCount) && employeeCount <= max));
}

async function discoverOrganizationsForAudience(audienceId) {
  const startedAt = new Date();
  try {
    const audience = await Audience.findById(audienceId);
    if (!audience) return { success: false, error: "Audience not found", errorCode: "not_found" };
    const organizations = await Organization.find({}).limit(500).lean();
    const matched = organizations.filter((org) => organizationMatches(org, audience.criteria));
    const scored = matched.map((org) => ({ org, ...scoreOrganization(org, audience.criteria) }))
      .filter((item) => item.score >= (audience.criteria?.minimumScore || 0));

    if (scored.length) {
      await Organization.bulkWrite(scored.map((item) => ({
        updateOne: {
          filter: { _id: item.org._id },
          update: { $set: { audienceScore: item.score, audienceTier: item.tier, scoreReasons: item.reasons } },
        },
      })));
    }
    const ids = scored.map((item) => item.org._id);
    audience.organizationIds = ids;
    audience.totalOrgs = ids.length;
    audience.lastDiscoveredAt = new Date();
    await audience.save();

    const completedAt = new Date();
    const distribution = { high: 0, medium: 0, low: 0, unscored: 0 };
    scored.forEach((item) => { distribution[item.tier] += 1; });
    const run = await DiscoveryRun.create({
      audienceId: audience._id,
      status: "success",
      criteriaSnapshot: audience.criteria,
      statistics: { organizationsFound: ids.length, organizationsCreated: 0, organizationsUpdated: ids.length, duplicatesSkipped: 0 },
      organizationIds: ids,
      scoreDistribution: distribution,
      pagination: { totalPages: ids.length ? 1 : 0, availableOrganizationsFromSearch: organizations.length, stoppedReason: "no_more_results" },
      startedAt,
      completedAt,
    });
    return { success: true, audienceId: String(audience._id), discoveryRunId: String(run._id), organizationsFound: ids.length, organizationsCreated: 0, organizationsUpdated: ids.length, duplicatesSkipped: 0, completedAt, audience };
  } catch (error) {
    return { success: false, error: error.message || "Organization research failed", errorCode: "research_failed" };
  }
}

async function discoverAudienceSources(query) {
  const results = [];
  const communityResults = await findCommunities(query);
  if (communityResults?.success) results.push(...(communityResults.results || []));
  return { success: true, results, sources: ["community"] };
}

async function discoverAndSaveOrganizations(options = {}) {
  if (options.audienceId) return discoverOrganizationsForAudience(options.audienceId);
  return { success: false, error: "Audience ID is required", errorCode: "invalid_request" };
}

module.exports = { discoverAudienceSources, discoverAndSaveOrganizations, discoverOrganizationsForAudience, scoreOrganization };
