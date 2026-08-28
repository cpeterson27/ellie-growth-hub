const assert = require("assert");
const leadQualificationService = require("./services/leadQualificationService");
const closerWorkflowService = require("./services/closerWorkflowService");
const salesAgentContextService = require("./services/salesAgentContextService");
const agentExecutionService = require("./services/agentExecutionService");
const agentToolExecutor = require("./services/agentToolExecutor");

const one = (value, inspect) => { const chain = { select() { return chain; }, lean: async () => value }; if (inspect) chain.inspect = inspect; return chain; };
const many = (value) => { const chain = { select() { return chain; }, sort() { return chain; }, limit() { return chain; }, lean: async () => value }; return chain; };

async function run() {
  const strongSignal = { score: 91, scoreReasons: ["Asked for underwriting help"], evidence: [{ label: "Public discussion", url: "https://example.test/post", observedAt: new Date() }], classification: "buyer_intent", audienceEligible: true, identityResolution: { status: "supported" }, title: "First multifamily acquisition" };
  const strong = leadQualificationService.deterministicQualification(strongSignal);
  assert.equal(strong.qualificationStatus, "qualified");
  assert.equal(strong.aiUseful, false, "clear deterministic leads must not spend AI usage");
  assert.equal(strong.evidence.length, 1);

  let aiCalls = 0;
  const ambiguousSignal = { _id: "signal-1", score: 67, scoreReasons: ["Asked a relevant question"], evidence: strongSignal.evidence, classification: "buyer_intent", audienceEligible: true, identityResolution: { status: "supported" }, title: "Exploring multifamily", monitorId: null };
  const evaluated = await leadQualificationService.evaluate({ workspaceId: "workspace-a", userId: "owner-a", signalId: "signal-1", auth: { effectivePermissions: ["discovery.manage"] }, useAi: true }, {
    IntentSignal: { findOne: () => ({ lean: async () => ambiguousSignal }) },
    ResearchMonitor: {},
    agentExecutionService: { runAgent: async (input) => { aiCalls += 1; assert.equal(input.agent, "lead"); return { output: { qualificationStatus: "qualified", confidence: 0.9, reasons: ["Possible near-term need"], likelyNeed: "Underwriting guidance", recommendedNextAction: "Review source", warnings: [] } }; } },
  });
  assert.equal(aiCalls, 1);
  assert.equal(evaluated.qualification.method, "deterministic_plus_ai");
  assert.deepEqual(evaluated.qualification.reasons, ambiguousSignal.scoreReasons, "observed reasons stay authoritative");
  assert.deepEqual(evaluated.qualification.aiInferences, ["Possible near-term need"]);

  let storedContact = null, storedOpportunity = null, contactCreates = 0, opportunityCreates = 0, activityUpserts = 0;
  class ContactMock { constructor(row) { Object.assign(this, row, { _id: "contact-1" }); contactCreates += 1; } async save() { storedContact = this; } static async findOne(query) { return query.email || query.providerContactId ? storedContact : null; } }
  class OpportunityMock { constructor(row) { Object.assign(this, row, { _id: "opp-1" }); opportunityCreates += 1; } async save() { storedOpportunity = this; } static async findOne() { return storedOpportunity; } }
  const convergenceModels = { Contact: ContactMock, Organization: {}, SalesOpportunity: OpportunityMock, IntentSignal: { updateOne: async () => {} }, CrmActivity: { findOneAndUpdate: async () => { activityUpserts += 1; } } };
  const conversionInput = { workspaceId: "workspace-a", userId: "owner-a", signal: { ...strongSignal, _id: "signal-strong", authorName: "Sarah Johnson", publishedEmails: ["sarah@example.test"], source: "reddit", sourceUrl: "https://example.test/post", sourceId: "post-1" }, qualification: { ...strong, aiInferences: [], method: "deterministic" }, input: {} };
  const firstConversion = await leadQualificationService.converge(conversionInput, convergenceModels);
  const secondConversion = await leadQualificationService.converge(conversionInput, convergenceModels);
  assert.equal(firstConversion.createdOpportunity, true); assert.equal(secondConversion.createdOpportunity, false);
  assert.equal(contactCreates, 1, "same-email processing must reuse the canonical Contact");
  assert.equal(opportunityCreates, 1, "reprocessing must reuse the active Opportunity");
  assert.equal(activityUpserts, 2, "activity writes use the same idempotency key on every attempt");

  const now = new Date("2026-08-27T12:00:00Z");
  assert.deepEqual(closerWorkflowService.neglectFlags({ opportunity: { ownerId: "closer-a", createdAt: new Date("2026-08-25T10:00:00Z"), leadQualification: { status: "qualified", priority: "high" }, leadLifecycle: {}, nextActionAt: new Date("2026-08-26T12:00:00Z"), stageKey: "qualified" }, lastActivity: null, application: null, now }), ["qualified_uncontacted", "assigned_untouched", "follow_up_overdue"]);

  assert.deepEqual(closerWorkflowService.opportunityScope({ workspaceId: "workspace-a", userId: "closer-a", auth: { roles: ["closer"], effectivePermissions: ["sales.opportunities.view_assigned"] } }), { workspaceId: "workspace-a", ownerId: "closer-a" });
  assert.deepEqual(closerWorkflowService.opportunityScope({ workspaceId: "workspace-a", userId: "owner-a", auth: { roles: ["owner"], effectivePermissions: ["sales.opportunities.view"] } }), { workspaceId: "workspace-a" });

  let notificationWrites = 0, activityWrites = 0;
  const opportunity = { _id: "opp-1", name: "Lead", ownerId: null, primaryContactId: "contact-1", closerAssignment: { history: [] }, leadLifecycle: {}, save: async () => opportunity };
  await closerWorkflowService.assign({ workspaceId: "workspace-a", opportunityId: "opp-1", closerUserId: "closer-a", actorUserId: "owner-a" }, {
    WorkspaceMembership: { findOne: () => ({ lean: async () => ({ role: "closer", workspaceId: "workspace-a" }) }) },
    SalesOpportunity: { findOne: async (query) => { assert.equal(query.workspaceId, "workspace-a"); return opportunity; } },
    CrmActivity: { create: async (row) => { activityWrites += 1; assert.equal(row.metadata.toUserId, "closer-a"); } },
    InAppNotification: { findOneAndUpdate: async () => { notificationWrites += 1; } },
  });
  assert.equal(opportunity.ownerId, "closer-a"); assert.equal(activityWrites, 1); assert.equal(notificationWrites, 1);

  let timelineWrites = 0, outboundCalls = 0;
  const assignedOpportunity = { _id: "opp-2", workspaceId: "workspace-a", ownerId: "closer-a", primaryContactId: "contact-2", leadLifecycle: {}, leadQualification: {}, save: async () => {} };
  await closerWorkflowService.recordActivity({ workspaceId: "workspace-a", userId: "closer-a", auth: { roles: ["closer"], effectivePermissions: ["sales.opportunities.manage_assigned"] }, opportunityId: "opp-2", outcome: "called", channel: "phone", notes: "Left a voicemail", nextFollowUpAt: new Date("2026-08-28T12:00:00Z") }, {
    SalesOpportunity: { findOne: async (query) => { assert.equal(query.ownerId, "closer-a"); return assignedOpportunity; } },
    CrmActivity: { create: async (row) => { timelineWrites += 1; assert.equal(row.metadata.outcome, "called"); } },
    Communications: { send: async () => { outboundCalls += 1; } },
  });
  assert.equal(timelineWrites, 1); assert.equal(outboundCalls, 0, "recording an activity must not contact a provider");

  let opportunityQuery;
  const sanitized = await salesAgentContextService.buildSalesAgentContext({ workspaceId: "workspace-a", userId: "closer-a", auth: { workspaceId: "workspace-a", roles: ["closer"], effectivePermissions: ["sales.opportunities.view_assigned"] }, opportunityId: "opp-safe" }, {
    SalesOpportunity: { findOne: (query) => { opportunityQuery = query; return one({ _id: "opp-safe", workspaceId: "workspace-a", ownerId: "closer-a", primaryContactId: "contact-safe", stageKey: "qualified", value: 1700, currency: "USD", nextAction: "Review evidence", nextActionAt: new Date("2026-08-28T12:00:00Z"), leadQualification: { status: "qualified", score: 91, priority: "high", confidence: 0.88, reasons: ["Observed request"], observedEvidence: [{ label: "Public source", url: "https://example.test/evidence" }], aiInferences: ["May need underwriting help"], likelyNeed: "Underwriting", recommendedNextAction: "Human review" }, leadLifecycle: {}, leadAttribution: { source: "reddit", monitorId: "monitor-1" }, applicationId: "app-1", coachingProgramId: "program-1", updatedAt: new Date("2026-08-20T12:00:00Z"), credentials: "must-not-pass", accessToken: "must-not-pass" }); } },
    Contact: { findOne: () => one({ name: "Sarah Johnson", email: "private@example.test", phone: "555-0100", address: "private", notes: "unrelated" }) },
    CoachingApplication: { findOne: () => one({ status: "submitted", submittedAt: new Date("2026-08-27T10:00:00Z"), coachingProgramId: "program-1", answers: { message: "private answer" }, paymentDetails: "private" }) },
    CrmActivity: { find: () => many([{ type: "call", direction: "outbound", title: "Attempted contact", body: "private notes", occurredAt: new Date("2026-08-26T10:00:00Z"), metadata: { outcome: "no_response", channel: "phone", providerPayload: { token: "secret" } } }]) },
    User: { findById: () => one({ name: "Assigned Closer", email: "closer@example.test" }) },
  });
  assert.equal(opportunityQuery.workspaceId, "workspace-a"); assert.equal(opportunityQuery.ownerId, "closer-a", "Closer context must be assignment scoped");
  await assert.rejects(() => salesAgentContextService.buildSalesAgentContext({ workspaceId: "workspace-b", userId: "closer-a", auth: { workspaceId: "workspace-a", roles: ["closer"], effectivePermissions: ["sales.opportunities.view_assigned"] }, opportunityId: "opp-safe" }, {}), (error) => error.code === "SALES_AGENT_WORKSPACE_FORBIDDEN");
  const serialized = JSON.stringify(sanitized);
  for (const forbidden of ["private@example.test", "555-0100", "private answer", "must-not-pass", "accessToken", "providerPayload", "closer@example.test", "private notes"]) assert(!serialized.includes(forbidden), `AI context leaked ${forbidden}`);
  assert.equal(sanitized.contact.displayName, "Sarah Johnson"); assert.equal(sanitized.application.status, "submitted"); assert.equal(sanitized.qualification.score, 91);

  let agentRequest, businessWrites = 0;
  const assist = await closerWorkflowService.salesAssist({ workspaceId: "workspace-a", userId: "closer-a", auth: { workspaceId: "workspace-a", roles: ["closer"], effectivePermissions: ["sales.opportunities.view_assigned"] }, opportunityId: "opp-safe", action: "draft_outreach" }, {
    salesAgentContextService: { buildSalesAgentContext: async () => sanitized },
    agentExecutionService: { runAgent: async (request) => { agentRequest = request; return { output: { suggestedOutreach: "Draft only" }, proposedAction: { proposedAction: { classification: "PROPOSE", executable: false } } }; } },
    Communications: { send: async () => { businessWrites += 1; } }, SalesOpportunity: { updateOne: async () => { businessWrites += 1; } },
  });
  assert.equal(agentRequest.agent, "sales"); assert.equal(agentRequest.task, "closer_draft_outreach"); assert.equal(agentRequest.options.proposedAction.payloadPreview.sendsAutomatically, false); assert.equal(businessWrites, 0); assert.equal(assist.output.suggestedOutreach, "Draft only");

  let knowledgeCalls = 0, llmRequest;
  await agentExecutionService.runAgent({ workspaceId: "workspace-a", userId: "closer-a", agent: "sales", task: "closer_next_step", input: { instruction: "Recommend next action" }, operationalContext: JSON.stringify(sanitized), correlationId: "sales-test", auth: { workspaceId: "workspace-a", effectivePermissions: ["sales.opportunities.view_assigned"] } }, {
    aiConfigService: { assertEnabled: async () => {} }, knowledgeService: { retrieveKnowledge: async ({ agent, categories }) => { knowledgeCalls += 1; assert.equal(agent, "sales"); assert(categories.includes("offers-programs")); return { context: "Approved sales guidance", sources: ["knowledge"] }; } },
    conversationService: { history: async () => ({ messages: [] }) }, llmService: { generateText: async (request) => { llmRequest = request; return "Recommendation"; }, getStatus: () => ({ model: "mock-model" }) },
  });
  assert.equal(knowledgeCalls, 1); assert.equal(llmRequest.agent, "sales"); assert.equal(llmRequest.feature, "agent.closer_next_step"); assert.equal(llmRequest.correlationId, "sales-test");
  const toolAuth = { workspaceId: "workspace-a", effectivePermissions: ["sales.opportunities.view_assigned"] };
  const toolResult = await agentToolExecutor.executeTool({ workspaceId: "workspace-a", userId: "closer-a", agent: "sales", toolId: "sales.get_lead_context", input: { opportunityId: "opp-safe" }, auth: toolAuth }, { services: { salesAgentContextService: { buildSalesAgentContext: async () => sanitized } } });
  assert.equal(toolResult.classification, "READ"); assert.equal(toolResult.result.contact.displayName, "Sarah Johnson");
  await assert.rejects(() => agentToolExecutor.executeTool({ workspaceId: "workspace-a", userId: "closer-a", agent: "sales", toolId: "crm.get_contact", input: { contactId: "contact-safe" }, auth: toolAuth }), (error) => error.code === "AGENT_TOOL_FORBIDDEN");

  let enrollmentsCreated = 0;
  const proposal = await closerWorkflowService.prepareCoachingHandoff({ workspaceId: "workspace-a", userId: "owner-a", auth: { roles: ["owner"], effectivePermissions: ["sales.opportunities.view"] }, opportunityId: "opp-1" }, {
    SalesOpportunity: { findOne: () => ({ lean: async () => ({ _id: "opp-1", stageKey: "won", primaryContactId: "contact-1", coachingProgramId: "program-1" }) }) },
    Enrollment: { findOne: () => ({ select: () => ({ lean: async () => null }) }), create: async () => { enrollmentsCreated += 1; } },
  });
  assert.equal(proposal.proposedAction.classification, "PROPOSE"); assert.equal(proposal.enrollmentCreated, false); assert.equal(enrollmentsCreated, 0);
  console.log("Lead/Closer workflow tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
