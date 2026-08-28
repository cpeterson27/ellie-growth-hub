const assert = require("assert");
const principals = require("./services/systemPrincipalService");
const policyService = require("./services/automationPolicyService");
const actionService = require("./services/automationActionService");
const backgroundService = require("./services/backgroundSocialAiService");

const noRuns = { countDocuments: async () => 0 };
const basePolicy = overrides => ({ ...policyService.defaults(), enabled: true, dryRun: false, ...overrides, socialAi: { allowedIntents: ["buying_intent"], confidenceThreshold: .8 } });

async function systemPrincipalTests() {
  const actor = principals.create({ workspaceId: "workspace-a", principal: "social_automation" });
  assert.equal(actor.actorType, "system"); assert.equal(actor.userId, null); assert(!actor.effectivePermissions.includes("workspace.manage"));
  assert.throws(() => principals.assertWorkspace(actor, "workspace-b"), /workspace mismatch/);
  assert.throws(() => principals.assertWorkspace({ ...actor, effectivePermissions: [...actor.effectivePermissions, "workspace.manage"] }, "workspace-a"), /escalation/);
}

async function policyTests() {
  const actor = principals.create({ workspaceId: "workspace-a", principal: "social_automation" });
  const aiConfigService = { assertEnabled: async () => ({ enabled: true }) };
  const reply = await policyService.evaluateAutomationAction({ workspaceId: "workspace-a", actor, action: "meta_reply", policy: basePolicy({ automaticProviderActionsAllowed: true, automaticReplyAllowed: true, humanApprovalRequired: false }), connection: { capabilityGranted: true, selectedAsset: true }, conversation: { messagingWindowOpen: true } }, { AutomationActionRun: noRuns, aiConfigService, env: { META_AUTOMATIC_REPLIES_ENABLED: "false" } });
  assert.equal(reply.mode, "blocked"); assert(reply.reasons.includes("environment_kill_switch_off"));
  const publish = await policyService.evaluateAutomationAction({ workspaceId: "workspace-a", actor, action: "social_publish", policy: basePolicy({ publishingAllowed: true, humanApprovalRequired: false }), connection: { capabilityGranted: true, selectedAsset: true } }, { AutomationActionRun: noRuns, aiConfigService, env: { SOCIAL_PUBLISHING_ENABLED: "false" } });
  assert.equal(publish.mode, "blocked");
  const confidence = await policyService.evaluateAutomationAction({ workspaceId: "workspace-a", actor, action: "crm_qualify", confidence: .4, intent: "buying_intent", policy: basePolicy({}) }, { AutomationActionRun: noRuns, aiConfigService, env: {} });
  assert(confidence.reasons.includes("confidence_below_threshold"));
  const intent = await policyService.evaluateAutomationAction({ workspaceId: "workspace-a", actor, action: "crm_qualify", confidence: .9, intent: "spam", policy: basePolicy({}) }, { AutomationActionRun: noRuns, aiConfigService, env: {} });
  assert(intent.reasons.includes("intent_not_allowed"));
  const closed = await policyService.evaluateAutomationAction({ workspaceId: "workspace-a", actor, action: "meta_reply", policy: basePolicy({}), connection: { capabilityGranted: true, selectedAsset: true }, conversation: { messagingWindowOpen: false } }, { AutomationActionRun: noRuns, aiConfigService, env: { META_AUTOMATIC_REPLIES_ENABLED: "true" } });
  assert(closed.reasons.includes("messaging_window_closed"));
  const limited = await policyService.evaluateAutomationAction({ workspaceId: "workspace-a", actor, action: "crm_qualify", policy: basePolicy({ maxActionsPerHour: 1 }) }, { AutomationActionRun: { countDocuments: async query => query.createdAt?.$gte ? 1 : 0 }, aiConfigService, env: {} });
  assert(limited.reasons.includes("hourly_limit_reached"));
  const budget = await policyService.evaluateAutomationAction({ workspaceId: "workspace-a", actor, action: "social_ai_analysis", policy: basePolicy({ backgroundSocialAiEnabled: true }) }, { AutomationActionRun: noRuns, aiConfigService: { assertEnabled: async () => { throw Object.assign(new Error("limit"), { code: "AI_MONTHLY_LIMIT_REACHED" }); } }, env: {} });
  assert(budget.reasons.includes("ai_budget_exhausted"));
}

async function actionLifecycleTests() {
  const actor = principals.create({ workspaceId: "workspace-a", principal: "social_automation" });
  let created = null, providerCalls = 0;
  const Runs = { findOne: async () => created, create: async values => { created = { _id: "run", ...values, save: async () => created }; return created; } };
  const policy = basePolicy({ dryRun: true, backgroundSocialAiEnabled: true });
  const dependencies = { AutomationActionRun: Runs, WorkspaceConfig: {}, aiConfigService: { assertEnabled: async () => ({}) }, policyService: { VERSION: policyService.VERSION, get: async () => policy, evaluateAutomationAction: input => policyService.evaluateAutomationAction(input, { AutomationActionRun: noRuns, aiConfigService: { assertEnabled: async () => ({}) }, env: {} }) } };
  const first = await actionService.propose({ workspaceId: "workspace-a", actor, triggerType: "webhook", triggerId: "event-1", actionType: "social_ai_analysis", proposedPayload: { conversationId: "thread", accessToken: "never-store", rawPayload: { secret: true } }, policy }, dependencies);
  const second = await actionService.propose({ workspaceId: "workspace-a", actor, triggerType: "webhook", triggerId: "event-1", actionType: "social_ai_analysis", proposedPayload: {}, policy }, dependencies);
  assert.equal(first.run.status, "dry_run"); assert.equal(second.reused, true); assert.equal(providerCalls, 0);
  assert(!JSON.stringify(first.run.proposedPayload).includes("never-store")); assert(!Object.hasOwn(first.run.proposedPayload, "rawPayload"));
  assert.equal(actionService.retryDecision({ code: "ETIMEDOUT" }, 1, 2).uncertain, true);
  assert.equal(actionService.retryDecision({ status: 403 }, 1, 2).retry, false);
  assert.equal(actionService.retryDecision({ status: 500 }, 1, 2, () => 0).retry, true);
}

async function backgroundTests() {
  const off = await backgroundService.processInbound({ workspaceId: "workspace-a", providerEventId: "event", conversation: { thread: { _id: "thread" } } }, { policyService: { get: async () => basePolicy({ enabled: false, backgroundSocialAiEnabled: false }) } });
  assert.equal(off.skippedReason, "background_ai_disabled");
  const deterministic = await backgroundService.processInbound({ workspaceId: "workspace-a", providerEventId: "event", conversation: { thread: { _id: "thread" } }, automation: { _id: "rule" } });
  assert.equal(deterministic.skippedReason, "deterministic_automation_matched");
  let aiRequest = null;
  const run = { _id: "run", status: "ready", save: async () => run };
  const result = await backgroundService.processInbound({ workspaceId: "workspace-a", providerEventId: "event-ai", conversation: { thread: { _id: "thread", channel: "instagram" } } }, {
    policyService: { get: async () => basePolicy({ backgroundSocialAiEnabled: true }) },
    actionService: { propose: async () => ({ run }) },
    socialAiService: { analyze: async request => { aiRequest = request; return { analysis: { _id: "analysis", leadPotential: "low", handoffState: "ai_assistance_available" } }; } },
  });
  assert.equal(result.run.status, "succeeded"); assert.equal(aiRequest.userId, null); assert.equal(aiRequest.actorType, "system"); assert.equal(aiRequest.principal, "social_automation");
}

(async () => { await systemPrincipalTests(); await policyTests(); await actionLifecycleTests(); await backgroundTests(); console.log("Automation safety, policy, system-principal, dry-run, retry, rate, and background AI tests passed"); })().catch(error => { console.error(error); process.exitCode = 1; });
