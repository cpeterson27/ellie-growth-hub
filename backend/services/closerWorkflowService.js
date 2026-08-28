const SalesOpportunity = require("../models/SalesOpportunity");
const Contact = require("../models/Contact");
const Organization = require("../models/Organization");
const CoachingApplication = require("../models/CoachingApplication");
const CrmActivity = require("../models/CrmActivity");
const WorkspaceMembership = require("../models/WorkspaceMembership");
const User = require("../models/User");
const InAppNotification = require("../models/InAppNotification");
const Enrollment = require("../models/Enrollment");
const agentExecutionService = require("./agentExecutionService");
const salesAgentContextService = require("./salesAgentContextService");

const deps = { SalesOpportunity, Contact, Organization, CoachingApplication, CrmActivity, WorkspaceMembership, User, InAppNotification, Enrollment, agentExecutionService, salesAgentContextService };
const OUTCOMES = new Set(["attempted_contact", "called", "emailed", "social_outreach", "conversation", "follow_up_scheduled", "no_response", "application_sent", "application_received", "meeting_booked", "qualified", "disqualified"]);
const broad = (auth) => (auth?.roles || [auth?.role]).some((role) => ["owner", "admin"].includes(role)) || auth?.effectivePermissions?.includes("sales.opportunities.view");
const opportunityScope = ({ workspaceId, userId, auth }, filter = {}) => ({ workspaceId, ...filter, ...(!broad(auth) ? { ownerId: userId } : {}) });
const clean = (value, limit = 1000) => String(value || "").replaceAll("\u0000", "").trim().slice(0, limit);

function neglectFlags({ opportunity, lastActivity, application, now = new Date() }) {
  const flags = [], day = 86400000, age = now - new Date(lastActivity?.occurredAt || opportunity.closerAssignment?.assignedAt || opportunity.updatedAt || opportunity.createdAt);
  if (opportunity.leadQualification?.status === "qualified" && !opportunity.leadLifecycle?.lastOutreachAt) flags.push("qualified_uncontacted");
  if (opportunity.ownerId && !lastActivity && age > day) flags.push("assigned_untouched");
  if (opportunity.nextActionAt && new Date(opportunity.nextActionAt) < now) flags.push("follow_up_overdue");
  if (application?.status === "submitted" && (!lastActivity || new Date(lastActivity.occurredAt) < new Date(application.submittedAt || application.createdAt))) flags.push("application_waiting");
  if (["high", "urgent"].includes(opportunity.leadQualification?.priority) && age > 3 * day && !["won", "lost"].includes(opportunity.stageKey)) flags.push("high_priority_stale");
  return flags;
}

async function queue({ workspaceId, userId, auth, view = "my", limit = 100 }, models = deps) {
  const filter = opportunityScope({ workspaceId, userId, auth }, { stageKey: { $nin: ["won", "lost"] }, "leadQualification.status": { $in: ["qualified", "needs_review"] } });
  if (view === "my" || !broad(auth)) filter.ownerId = userId;
  if (view === "high") filter["leadQualification.priority"] = { $in: ["high", "urgent"] };
  if (view === "application") filter.applicationId = { $ne: null };
  const opportunities = await models.SalesOpportunity.find(filter).sort({ "leadQualification.score": -1, nextActionAt: 1, updatedAt: 1 }).limit(Math.min(250, Math.max(1, Number(limit) || 100))).lean();
  const contactIds = [...new Set(opportunities.map((item) => String(item.primaryContactId || "")).filter(Boolean))], opportunityIds = opportunities.map((item) => item._id), organizationIds = [...new Set(opportunities.map((item) => String(item.organizationId || "")).filter(Boolean))], ownerIds = [...new Set(opportunities.map((item) => String(item.ownerId || "")).filter(Boolean))];
  const [contacts, organizations, applications, activities, owners] = await Promise.all([
    models.Contact.find({ workspaceId, _id: { $in: contactIds } }).select("name email phone company title stage status sourceProvider sources socialAttribution additionalFields").lean(),
    models.Organization.find({ workspaceId, _id: { $in: organizationIds } }).select("name domain").lean(),
    models.CoachingApplication.find({ workspaceId, salesOpportunityId: { $in: opportunityIds } }).select("salesOpportunityId status submittedAt coachingProgramId assignedUserId").lean(),
    models.CrmActivity.find({ workspaceId, "metadata.opportunityId": { $in: opportunityIds } }).sort({ occurredAt: -1 }).lean(),
    models.User.find({ _id: { $in: ownerIds } }).select("name email avatarUrl").lean(),
  ]);
  const byId = (rows) => new Map(rows.map((row) => [String(row._id), row])), contactMap = byId(contacts), organizationMap = byId(organizations), ownerMap = byId(owners), appMap = new Map(applications.map((row) => [String(row.salesOpportunityId), row]));
  const activityMap = new Map(); for (const item of activities) if (!activityMap.has(String(item.metadata?.opportunityId))) activityMap.set(String(item.metadata?.opportunityId), item);
  let items = opportunities.map((opportunity) => { const contact = contactMap.get(String(opportunity.primaryContactId)), application = appMap.get(String(opportunity._id)), lastActivity = activityMap.get(String(opportunity._id)), flags = neglectFlags({ opportunity, application, lastActivity }); return { opportunityId: opportunity._id, contactId: opportunity.primaryContactId, contactName: contact?.name || opportunity.name, contactEmail: contact?.email || "", organization: organizationMap.get(String(opportunity.organizationId)) || (contact?.company ? { name: contact.company } : null), qualification: opportunity.leadQualification, source: opportunity.leadAttribution?.source || contact?.sourceProvider || contact?.sources?.[0] || "unknown", attribution: opportunity.leadAttribution, assignedCloser: ownerMap.get(String(opportunity.ownerId)) || null, assignedCloserId: opportunity.ownerId || null, opportunityStage: opportunity.stageKey, opportunityValue: opportunity.value, currency: opportunity.currency, lastActivity: lastActivity ? { title: lastActivity.title, outcome: lastActivity.metadata?.outcome || "", occurredAt: lastActivity.occurredAt, channel: lastActivity.metadata?.channel || lastActivity.direction || "" } : null, lastOutreachAt: opportunity.leadLifecycle?.lastOutreachAt || null, nextAction: opportunity.nextAction, nextFollowUpAt: opportunity.nextActionAt, application: application ? { id: application._id, status: application.status, submittedAt: application.submittedAt, coachingProgramId: application.coachingProgramId } : null, flags } });
  if (view === "follow_up") items = items.filter((item) => item.flags.includes("follow_up_overdue"));
  if (view === "new") items = items.filter((item) => item.flags.includes("qualified_uncontacted") || item.flags.includes("assigned_untouched"));
  items.sort((a, b) => (b.flags.length - a.flags.length) || ((b.qualification?.score || 0) - (a.qualification?.score || 0)));
  return items;
}

async function assign({ workspaceId, opportunityId, closerUserId, actorUserId, source = "manual", reason = "" }, models = deps) {
  const membership = await models.WorkspaceMembership.findOne({ workspaceId, userId: closerUserId, status: "active", $or: [{ role: "closer" }, { roles: "closer" }] }).lean();
  if (!membership) { const error = new Error("Select an active Closer in this workspace"); error.code = "CLOSER_INVALID"; throw error; }
  const opportunity = await models.SalesOpportunity.findOne({ _id: opportunityId, workspaceId });
  if (!opportunity) { const error = new Error("Opportunity not found"); error.code = "OPPORTUNITY_NOT_FOUND"; throw error; }
  const fromUserId = opportunity.ownerId || null, now = new Date();
  opportunity.ownerId = closerUserId; opportunity.closerAssignment = opportunity.closerAssignment || {}; opportunity.closerAssignment.history = opportunity.closerAssignment.history || []; opportunity.closerAssignment.assignedAt = now; opportunity.closerAssignment.source = clean(source, 80); opportunity.closerAssignment.reason = clean(reason, 500); opportunity.closerAssignment.history.push({ fromUserId, toUserId: closerUserId, assignedAt: now, assignedByUserId: actorUserId, source: clean(source, 80) || "manual", reason: clean(reason, 500) }); opportunity.leadLifecycle = { ...(opportunity.leadLifecycle?.toObject?.() || opportunity.leadLifecycle || {}), status: "assigned", statusAt: now };
  await opportunity.save();
  await models.CrmActivity.create({ workspaceId, contactId: opportunity.primaryContactId, organizationId: opportunity.organizationId, campaignId: opportunity.campaignId, type: "status_change", title: fromUserId ? "Closer reassigned" : "Closer assigned", body: clean(reason, 500), source: "crm", createdBy: actorUserId, metadata: { eventType: "closer.assigned", opportunityId: opportunity._id, fromUserId, toUserId: closerUserId, source: clean(source, 80) } });
  await models.InAppNotification.findOneAndUpdate({ workspaceId, userId: closerUserId, eventKey: `closer-assignment:${opportunity._id}:${now.getTime()}` }, { $setOnInsert: { type: "closer_assignment", title: "New lead assigned", message: `${opportunity.name} is ready in your Closer Queue.`, actionUrl: `/opportunities?view=closer-queue&opportunity=${opportunity._id}` } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return opportunity;
}

async function recordActivity({ workspaceId, userId, auth, opportunityId, outcome, channel = "", notes = "", nextFollowUpAt = null }, models = deps) {
  if (!OUTCOMES.has(outcome)) { const error = new Error("Choose a supported sales activity outcome"); error.code = "ACTIVITY_OUTCOME_INVALID"; throw error; }
  const opportunity = await models.SalesOpportunity.findOne(opportunityScope({ workspaceId, userId, auth }, { _id: opportunityId }));
  if (!opportunity) { const error = new Error("Opportunity not found"); error.code = "OPPORTUNITY_NOT_FOUND"; throw error; }
  const now = new Date(), outreach = ["attempted_contact", "called", "emailed", "social_outreach", "no_response"].includes(outcome), engaged = ["conversation", "application_received", "meeting_booked", "qualified"].includes(outcome);
  opportunity.leadLifecycle = opportunity.leadLifecycle || {};
  opportunity.leadQualification = opportunity.leadQualification || {};
  const type = outcome === "called" ? "call" : outcome === "meeting_booked" ? "meeting" : ["emailed", "social_outreach"].includes(outcome) ? "email" : outcome === "follow_up_scheduled" ? "task" : "note";
  const activity = await models.CrmActivity.create({ workspaceId, contactId: opportunity.primaryContactId, organizationId: opportunity.organizationId, campaignId: opportunity.campaignId, type, direction: outreach ? "outbound" : "", title: outcome.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "), body: clean(notes, 5000), occurredAt: now, dueAt: nextFollowUpAt || null, source: "crm", createdBy: userId, metadata: { eventType: "closer.activity", opportunityId: opportunity._id, outcome, channel: clean(channel, 40) } });
  if (outreach) { opportunity.leadLifecycle.lastOutreachAt = now; opportunity.leadLifecycle.status = "contacted"; }
  if (engaged) { opportunity.leadLifecycle.lastEngagedAt = now; opportunity.leadLifecycle.status = outcome === "application_received" ? "application" : "engaged"; }
  if (outcome === "disqualified") opportunity.leadQualification.status = "not_qualified";
  if (nextFollowUpAt) { opportunity.nextActionAt = nextFollowUpAt; opportunity.nextAction = clean(notes, 500) || "Follow up"; }
  opportunity.leadLifecycle.statusAt = now;
  await opportunity.save();
  return { activity, opportunity };
}

async function salesAssist({ workspaceId, userId, auth, opportunityId, action = "next_step", objection = "" }, models = deps) {
  const tasks = { summarize: "Summarize this lead using only the established facts.", why_qualified: "Explain why this lead is qualified and distinguish evidence from inference.", next_step: "Recommend the next human sales action.", draft_outreach: "Draft a concise outreach opener for the human Closer to review and copy if desired.", follow_up: "Recommend a follow-up approach and timing.", handle_objection: "Suggest objection-handling guidance grounded in approved business knowledge." };
  if (!tasks[action]) { const error = new Error("Choose a supported Sales Agent action"); error.code = "SALES_AGENT_ACTION_INVALID"; throw error; }
  const context = await models.salesAgentContextService.buildSalesAgentContext({ workspaceId, userId, auth, opportunityId });
  return models.agentExecutionService.runAgent({
    workspaceId, userId, agent: "sales", task: `closer_${action}`,
    input: { instruction: tasks[action], ...(action === "handle_objection" ? { objection: clean(objection, 1000) } : {}) },
    operationalContext: JSON.stringify(context), correlationId: `sales-assist:${opportunityId}:${Date.now()}`, auth,
    options: {
      knowledgeQuery: `${tasks[action]} ${context.qualification.likelyNeed}`,
      knowledgeCategories: ["offers-programs", "contacts-icp", "sops", "decisions", "marketing-channels"],
      responseSchema: { type: "object", properties: { summary: { type: "string" }, recommendedNextAction: { type: "string" }, suggestedOutreach: { type: "string" }, objectionGuidance: { type: "string" }, followUpRecommendation: { type: "string" }, warnings: { type: "array", items: { type: "string" } } }, required: ["summary", "recommendedNextAction", "suggestedOutreach", "objectionGuidance", "followUpRecommendation", "warnings"], additionalProperties: false },
      schemaName: "sales_agent_recommendation",
      proposedAction: { tool: "communications.outreach_draft", payloadPreview: { opportunityId, sendsAutomatically: false } },
    },
  });
}

async function analytics({ workspaceId, userId, auth }, models = deps) {
  const opportunities = await models.SalesOpportunity.find(opportunityScope({ workspaceId, userId, auth }, { "leadAttribution.signalId": { $ne: null } })).select("stageKey ownerId value currency wonAt lostAt leadQualification leadLifecycle leadAttribution applicationId").lean();
  const won = opportunities.filter((item) => item.stageKey === "won"), lost = opportunities.filter((item) => item.stageKey === "lost"), sum = (rows) => rows.reduce((total, item) => total + (Number(item.value) || 0), 0);
  const group = (field) => Object.values(opportunities.reduce((result, item) => { const key = field === "source" ? item.leadAttribution?.source || "unknown" : String(item.ownerId || "unassigned"); const row = result[key] ||= { key, leads: 0, wins: 0, losses: 0, revenue: 0 }; row.leads += 1; if (item.stageKey === "won") { row.wins += 1; row.revenue += Number(item.value) || 0; } if (item.stageKey === "lost") row.losses += 1; return result; }, {}));
  return { leadsGenerated: opportunities.length, leadsQualified: opportunities.filter((item) => item.leadQualification?.status === "qualified").length, leadsAssigned: opportunities.filter((item) => item.ownerId).length, leadsContacted: opportunities.filter((item) => item.leadLifecycle?.lastOutreachAt).length, applications: opportunities.filter((item) => item.applicationId).length, wins: won.length, losses: lost.length, revenue: sum(won), conversionRate: opportunities.length ? Math.round(won.length / opportunities.length * 1000) / 10 : 0, bySource: group("source"), byCloser: group("closer") };
}

async function prepareCoachingHandoff({ workspaceId, userId, auth, opportunityId }, models = deps) {
  const opportunity = await models.SalesOpportunity.findOne(opportunityScope({ workspaceId, userId, auth }, { _id: opportunityId, stageKey: "won" })).lean();
  if (!opportunity || !opportunity.coachingProgramId || !opportunity.primaryContactId) { const error = new Error("This Won opportunity is not ready for a coaching enrollment handoff"); error.code = "HANDOFF_NOT_ELIGIBLE"; throw error; }
  const existingEnrollment = await models.Enrollment.findOne({ workspaceId, sourceOpportunityId: opportunity._id }).select("_id status").lean();
  return { agent: "sales", recommendation: existingEnrollment ? "An enrollment already exists for this opportunity." : "This Won coaching sale is eligible for Owner/Admin enrollment review.", proposedAction: { tool: "coaching.create_enrollment", payloadPreview: { contactId: opportunity.primaryContactId, coachingProgramId: opportunity.coachingProgramId, sourceOpportunityId: opportunity._id }, classification: "PROPOSE", requiresApproval: true, executable: false }, existingEnrollment: existingEnrollment || null, enrollmentCreated: false };
}

module.exports = { OUTCOMES, analytics, assign, broad, neglectFlags, opportunityScope, prepareCoachingHandoff, queue, recordActivity, salesAssist };
