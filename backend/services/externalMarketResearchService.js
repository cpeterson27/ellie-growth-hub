const Audience = require("../models/Audience");
const MarketResearchJob = require("../models/MarketResearchJob");
const Organization = require("../models/Organization");
const { searchBusinessFeed } = require("./businessDataSourceService");
const { scoreOrganization } = require("./audience");

const uniqueEvidence = (entries = []) => {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.sourceType}|${entry.sourceUrl}|${entry.field}`;
    if (!entry.sourceUrl || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

async function upsertOrganization(workspaceId, item, criteria) {
  const identity = item.domain
    ? { workspaceId, domain: item.domain }
    : { workspaceId, [`externalSources.${item.sourceId}.id`]: item.providerId };
  const existing = await Organization.findOne(identity);
  const merged = { ...(existing?.toObject?.() || {}), ...item };
  const { score, tier, reasons } = scoreOrganization(merged, criteria);
  const evidence = uniqueEvidence([...(existing?.researchEvidence || []).map((entry) => entry.toObject?.() || entry), ...item.evidence]);
  const update = {
    workspaceId,
    name: item.name,
    domain: item.domain || null,
    source: "public_web",
    website: item.website || existing?.website || "",
    industry: item.industry || existing?.industry || "",
    description: item.description || existing?.description || "",
    employeeCount: item.employeeCount ?? existing?.employeeCount ?? null,
    location: item.location || existing?.location || "",
    phone: item.phone || existing?.phone || "",
    locationCount: item.locationCount ?? existing?.locationCount ?? null,
    rating: item.rating ?? existing?.rating ?? null,
    reviewCount: item.reviewCount ?? existing?.reviewCount ?? null,
    keywords: [...new Set([...(existing?.keywords || []), ...(item.keywords || [])])],
    researchEvidence: evidence,
    decisionMakers: item.decisionMakers || existing?.decisionMakers || [],
    lastResearchVerifiedAt: evidence.length ? new Date() : existing?.lastResearchVerifiedAt || null,
    audienceScore: score,
    audienceTier: tier,
    scoreReasons: reasons,
    [`externalSources.${item.sourceId}`]: { id: item.providerId || null, refreshedAt: new Date() },
  };
  const organization = await Organization.findOneAndUpdate(identity, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return { organization, created: !existing };
}

async function runMarketResearchJob(jobId, { maxResults = 1000 } = {}) {
  const job = await MarketResearchJob.findById(jobId);
  if (!job || job.status === "running" || job.status === "completed") return job;
  job.status = "running";
  job.startedAt = new Date();
  job.error = "";
  await job.save();
  try {
    let cursor = null;
    let received = 0;
    const organizationIds = [];
    const seen = new Set();
    do {
      const page = await searchBusinessFeed({ plan: job.plan, cursor, limit: Math.min(250, maxResults - received) });
      if (!page.success) {
        job.status = page.code === "source_required" ? "source_required" : "failed";
        job.error = page.message;
        job.completedAt = new Date();
        await job.save();
        return job;
      }
      for (const item of page.results) {
        const signature = item.domain || `${item.sourceId}:${item.providerId}`;
        if (seen.has(signature)) { job.statistics.duplicates += 1; continue; }
        seen.add(signature);
        received += 1;
        try {
          const result = await upsertOrganization(job.workspaceId, item, job.plan.criteria || {});
          organizationIds.push(result.organization._id);
          if (result.created) job.statistics.created += 1;
          else job.statistics.updated += 1;
        } catch {
          job.statistics.rejected += 1;
        }
        if (received >= maxResults) break;
      }
      cursor = page.cursor;
    } while (cursor && received < maxResults);

    job.statistics.received = received;
    job.status = "completed";
    job.completedAt = new Date();
    const audience = await Audience.findById(job.audienceId);
    if (audience) {
      audience.organizationIds = [...new Set([...(audience.organizationIds || []).map(String), ...organizationIds.map(String)])];
      audience.totalOrgs = audience.organizationIds.length;
      audience.lastDiscoveredAt = new Date();
      await audience.save();
    }
    await job.save();
    return job;
  } catch (error) {
    job.status = "failed";
    job.error = error.response?.data?.message || error.message || "External research failed.";
    job.completedAt = new Date();
    await job.save();
    return job;
  }
}

module.exports = { runMarketResearchJob, upsertOrganization };
