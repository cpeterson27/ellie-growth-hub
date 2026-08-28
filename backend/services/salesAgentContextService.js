const SalesOpportunity = require("../models/SalesOpportunity");
const Contact = require("../models/Contact");
const CoachingApplication = require("../models/CoachingApplication");
const CrmActivity = require("../models/CrmActivity");
const User = require("../models/User");

const deps = { SalesOpportunity, Contact, CoachingApplication, CrmActivity, User };
const broad = (auth) => (auth?.roles || [auth?.role]).some((role) => ["owner", "admin"].includes(role)) || auth?.effectivePermissions?.includes("sales.opportunities.view");
const scope = ({ workspaceId, userId, auth, opportunityId }) => ({ _id: opportunityId, workspaceId, ...(!broad(auth) ? { ownerId: userId } : {}) });
const text = (value, limit = 1000) => String(value || "").replaceAll("\u0000", "").trim().slice(0, limit);
const date = (value) => value ? new Date(value).toISOString() : null;

// This explicit DTO is the approved external-AI boundary. Never replace these
// allowlists with raw Mongoose documents, spreads, toObject(), or provider data.
async function buildSalesAgentContext({ workspaceId, userId, auth, opportunityId, neglectFlags = [] }, models = deps) {
  if (!auth || String(auth.workspaceId || "") !== String(workspaceId || "")) { const error = new Error("Sales Agent workspace context does not match the caller"); error.code = "SALES_AGENT_WORKSPACE_FORBIDDEN"; throw error; }
  const opportunity = await models.SalesOpportunity.findOne(scope({ workspaceId, userId, auth, opportunityId })).select("name stageKey value currency ownerId primaryContactId nextAction nextActionAt leadQualification leadLifecycle leadAttribution applicationId coachingProgramId updatedAt").lean();
  if (!opportunity) { const error = new Error("Opportunity not found"); error.code = "OPPORTUNITY_NOT_FOUND"; throw error; }
  const [contact, application, activities, closer] = await Promise.all([
    models.Contact.findOne({ _id: opportunity.primaryContactId, workspaceId }).select("name").lean(),
    models.CoachingApplication.findOne({ workspaceId, $or: [{ _id: opportunity.applicationId }, { salesOpportunityId: opportunity._id }] }).select("status submittedAt coachingProgramId").lean(),
    models.CrmActivity.find({ workspaceId, "metadata.opportunityId": opportunity._id }).select("type direction title occurredAt dueAt metadata.outcome metadata.channel").sort({ occurredAt: -1 }).limit(12).lean(),
    opportunity.ownerId ? models.User.findById(opportunity.ownerId).select("name").lean() : null,
  ]);
  const qualification = opportunity.leadQualification || {};
  const attribution = opportunity.leadAttribution || {};
  const flags = [...neglectFlags];
  const lastActivity = activities[0];
  const ageMs = Date.now() - new Date(lastActivity?.occurredAt || opportunity.updatedAt || 0).getTime();
  if (qualification.status === "qualified" && !opportunity.leadLifecycle?.lastOutreachAt) flags.push("qualified_uncontacted");
  if (opportunity.nextActionAt && new Date(opportunity.nextActionAt) < new Date()) flags.push("follow_up_overdue");
  if (["high", "urgent"].includes(qualification.priority) && ageMs > 3 * 86400000 && !["won", "lost"].includes(opportunity.stageKey)) flags.push("high_priority_stale");
  if (application?.status === "submitted" && (!lastActivity || new Date(lastActivity.occurredAt) < new Date(application.submittedAt || 0))) flags.push("application_waiting");
  return {
    contact: { displayName: text(contact?.name, 240) },
    qualification: {
      status: text(qualification.status, 40), score: Number.isFinite(qualification.score) ? qualification.score : null,
      priority: text(qualification.priority, 20), confidence: Number.isFinite(qualification.confidence) ? qualification.confidence : null,
      reasons: (qualification.reasons || []).map((item) => text(item, 500)).filter(Boolean).slice(0, 12),
      observedEvidence: (qualification.observedEvidence || []).map((item) => ({ label: text(item.label, 200), url: text(item.url, 2000), observedAt: date(item.observedAt) })).slice(0, 12),
      aiInferences: (qualification.aiInferences || []).map((item) => text(item, 500)).filter(Boolean).slice(0, 12),
      likelyNeed: text(qualification.likelyNeed, 1000), recommendedNextAction: text(qualification.recommendedNextAction, 1000),
      warnings: (qualification.warnings || []).map((item) => text(item, 500)).filter(Boolean).slice(0, 12),
    },
    attribution: {
      source: text(attribution.source, 100), monitorId: attribution.monitorId ? String(attribution.monitorId) : null,
      campaignId: attribution.campaignId ? String(attribution.campaignId) : null, eventId: attribution.eventId ? String(attribution.eventId) : null,
      socialProvider: text(attribution.socialProvider, 80), sourceUrl: text(attribution.sourceUrl, 2000),
    },
    opportunity: {
      stage: text(opportunity.stageKey, 80), value: Number.isFinite(opportunity.value) ? opportunity.value : null,
      currency: text(opportunity.currency, 3), assignedCloser: text(closer?.name, 240),
      nextAction: text(opportunity.nextAction, 500), nextFollowUpAt: date(opportunity.nextActionAt),
      lastOutreachAt: date(opportunity.leadLifecycle?.lastOutreachAt), lifecycleStatus: text(opportunity.leadLifecycle?.status, 40),
      programId: opportunity.coachingProgramId ? String(opportunity.coachingProgramId) : null,
    },
    application: application ? { status: text(application.status, 60), submittedAt: date(application.submittedAt), programId: application.coachingProgramId ? String(application.coachingProgramId) : null } : null,
    recentActivity: activities.map((item) => ({ type: text(item.type, 40), direction: text(item.direction, 20), title: text(item.title, 300), outcome: text(item.metadata?.outcome, 80), channel: text(item.metadata?.channel, 80), occurredAt: date(item.occurredAt), dueAt: date(item.dueAt) })),
    deterministicFlags: [...new Set(flags)].map((item) => text(item, 80)).filter(Boolean).slice(0, 12),
  };
}

module.exports = { buildSalesAgentContext, scope };
