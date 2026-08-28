const WorkspaceConfig = require("../models/WorkspaceConfig");
const InAppNotification = require("../models/InAppNotification");
const automationPolicyService = require("./automationPolicyService");
const automationActionService = require("./automationActionService");
const socialAiService = require("./socialAiService");
const systemPrincipalService = require("./systemPrincipalService");

async function notify(workspaceId, eventKey, title, message, dependencies = {}) {
  const Model = dependencies.InAppNotification || InAppNotification;
  if (!Model?.findOneAndUpdate) return;
  await Model.findOneAndUpdate({ workspaceId, userId: null, eventKey }, { $setOnInsert: { type: "social_automation_attention", title, message, actionUrl: "/social/inbox" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

async function processInbound({ workspaceId, providerEventId, conversation, automation }, dependencies = {}) {
  if (!workspaceId || !conversation?.thread?._id) return { skippedReason: "conversation_unavailable" };
  if (automation) return { skippedReason: "deterministic_automation_matched" };
  const policyService = dependencies.policyService || automationPolicyService, actionService = dependencies.actionService || automationActionService, aiService = dependencies.socialAiService || socialAiService;
  const policy = await policyService.get(workspaceId, dependencies.WorkspaceConfig || WorkspaceConfig);
  if (!policy.enabled || !policy.backgroundSocialAiEnabled) return { skippedReason: "background_ai_disabled" };
  const actor = systemPrincipalService.create({ workspaceId, principal: "social_automation" });
  const proposal = await actionService.propose({ workspaceId, actor, triggerType: "social_webhook", triggerId: String(providerEventId), agent: "social", actionType: "social_ai_analysis", provider: conversation.thread.channel, targetType: "conversation", targetId: String(conversation.thread._id), conversationId: conversation.thread._id, proposedPayload: { conversationId: String(conversation.thread._id), analysisAction: "identify_intent" }, correlationId: `social-webhook:${providerEventId}`, policy }, dependencies);
  if (!["ready", "dry_run"].includes(proposal.run.status)) return { run: proposal.run, skippedReason: proposal.run.failureCategory || "policy_blocked" };
  try {
    const result = await aiService.analyze({ workspaceId, userId: null, actorType: "system", principal: actor.principal, auth: actor, threadId: conversation.thread._id, action: "identify_intent", forceAi: false }, dependencies.socialAiDependencies);
    if (!result.analysis) return { run: proposal.run, skippedReason: result.skippedReason || "analysis_not_created" };
    proposal.run.status = "succeeded"; proposal.run.completedAt = new Date(); proposal.run.providerResultCategory = result.reused ? "analysis_reused" : "analysis_created"; await proposal.run.save();
    const analysis = result.analysis;
    if (["human_review_required", "closer_attention_required"].includes(analysis.handoffState)) await notify(workspaceId, `social-ai-review:${analysis._id}`, analysis.leadPotential === "high" ? "High-potential social lead needs review" : "Social conversation needs human review", analysis.recommendedAction || "Open Social Inbox to review the conversation.", dependencies);
    if (policy.qualificationAutomationAllowed && ["medium", "high"].includes(analysis.leadPotential)) await actionService.propose({ workspaceId, actor, triggerType: "social_ai_analysis", triggerId: String(analysis._id), agent: "social", actionType: "crm_qualify", provider: analysis.platform, targetType: "conversation", targetId: String(conversation.thread._id), conversationId: conversation.thread._id, confidence: analysis.confidence, intent: analysis.intent, proposedPayload: { analysisId: String(analysis._id), conversationId: String(conversation.thread._id) }, correlationId: analysis.correlationId, policy }, dependencies);
    return { run: proposal.run, analysis, reused: result.reused };
  } catch (error) {
    proposal.run.status = "blocked"; proposal.run.failureCategory = ["AI_MONTHLY_LIMIT_REACHED", "AI_DISABLED", "JARVIS_OPENAI_NOT_ENABLED"].includes(error.code) ? "ai_unavailable" : "analysis_failed"; proposal.run.completedAt = new Date(); await proposal.run.save();
    await notify(workspaceId, `social-ai-failure:${providerEventId}`, "Background Social AI paused", proposal.run.failureCategory === "ai_unavailable" ? "Deterministic social ingestion continues, but AI analysis is unavailable." : "A social conversation needs manual review.", dependencies);
    return { run: proposal.run, skippedReason: proposal.run.failureCategory };
  }
}
module.exports = { processInbound };
