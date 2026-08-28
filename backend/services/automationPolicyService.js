const WorkspaceConfig = require("../models/WorkspaceConfig");
const AutomationActionRun = require("../models/AutomationActionRun");
const aiConfigService = require("./aiConfigService");
const systemPrincipalService = require("./systemPrincipalService");

const VERSION = "automation-policy-2026-08-28.v1";
const defaults = () => ({ enabled: false, dryRun: true, backgroundSocialAiEnabled: false, qualificationAutomationAllowed: false, humanApprovalRequired: true, automaticProviderActionsAllowed: false, automaticReplyAllowed: false, publishingAllowed: false, requireProviderCapability: true, requireMessagingWindow: true, requireSelectedAsset: true, stopOnUncertainOutcome: true, maxRetries: 2, maxActionsPerHour: 20, maxActionsPerDay: 100, conversationCooldownMinutes: 15, duplicateWindowMinutes: 1440 });
async function get(workspaceId, Model = WorkspaceConfig) { const row = await Model.findOne({ workspaceId, key: "primary" }).select("automationPolicy socialAi").lean(); return { ...defaults(), ...(row?.automationPolicy || {}), socialAi: row?.socialAi || {} }; }
async function save(workspaceId, input, Model = WorkspaceConfig) {
  const current = await get(workspaceId, Model), safe = { ...current, ...input };
  const value = {
    enabled: input.enabled === true, dryRun: input.dryRun !== false, backgroundSocialAiEnabled: input.backgroundSocialAiEnabled === true,
    qualificationAutomationAllowed: input.qualificationAutomationAllowed === true, humanApprovalRequired: input.humanApprovalRequired !== false,
    automaticProviderActionsAllowed: input.automaticProviderActionsAllowed === true, automaticReplyAllowed: input.automaticReplyAllowed === true, publishingAllowed: input.publishingAllowed === true,
    requireProviderCapability: input.requireProviderCapability !== false, requireMessagingWindow: input.requireMessagingWindow !== false, requireSelectedAsset: input.requireSelectedAsset !== false,
    stopOnUncertainOutcome: input.stopOnUncertainOutcome !== false, maxRetries: Math.min(5, Math.max(0, Number(safe.maxRetries) || 0)),
    maxActionsPerHour: Math.min(1000, Math.max(1, Number(safe.maxActionsPerHour) || 20)), maxActionsPerDay: Math.min(10000, Math.max(1, Number(safe.maxActionsPerDay) || 100)),
    conversationCooldownMinutes: Math.min(1440, Math.max(0, Number(safe.conversationCooldownMinutes) || 0)), duplicateWindowMinutes: Math.min(43200, Math.max(1, Number(safe.duplicateWindowMinutes) || 1440)),
  };
  const row = await Model.findOneAndUpdate({ workspaceId, key: "primary" }, { $set: { automationPolicy: value }, $setOnInsert: { key: "primary" } }, { upsert: true, new: true, runValidators: true });
  return row.automationPolicy?.toObject ? row.automationPolicy.toObject() : row.automationPolicy;
}
function environmentAllows(actionType, env = process.env) {
  if (actionType === "meta_reply") return env.META_AUTOMATIC_REPLIES_ENABLED === "true";
  if (actionType === "social_publish") return env.SOCIAL_PUBLISHING_ENABLED === "true";
  return true;
}
async function evaluateAutomationAction(input, dependencies = {}) {
  const Model = dependencies.WorkspaceConfig || WorkspaceConfig, Runs = dependencies.AutomationActionRun || AutomationActionRun;
  const policy = input.policy || await get(input.workspaceId, Model), reasons = [], checks = {};
  checks.workspaceBound = Boolean(input.actor && String(input.actor.workspaceId) === String(input.workspaceId));
  if (!checks.workspaceBound) reasons.push("actor_workspace_mismatch");
  if (input.actor?.actorType === "system") { try { systemPrincipalService.assertWorkspace(input.actor, input.workspaceId); checks.actorAuthorized = input.actor.effectivePermissions.includes("social.automation.evaluate"); } catch { checks.actorAuthorized = false; } }
  else checks.actorAuthorized = Boolean(input.actor?.effectivePermissions?.includes("social.manage"));
  if (!checks.actorAuthorized) reasons.push("actor_capability_missing");
  checks.automationEnabled = policy.enabled === true; if (!checks.automationEnabled) reasons.push("workspace_automation_disabled");
  checks.featureEnabled = input.action !== "social_ai_analysis" || policy.backgroundSocialAiEnabled === true; if (!checks.featureEnabled) reasons.push("background_ai_disabled");
  checks.actionFeatureEnabled = input.action === "meta_reply" ? policy.automaticProviderActionsAllowed === true && policy.automaticReplyAllowed === true : input.action === "social_publish" ? policy.automaticProviderActionsAllowed === true && policy.publishingAllowed === true : input.action === "crm_qualify" ? policy.qualificationAutomationAllowed === true : true;
  if (!checks.actionFeatureEnabled) reasons.push("action_feature_disabled");
  checks.environmentKillSwitch = environmentAllows(input.action, dependencies.env || process.env); if (!checks.environmentKillSwitch) reasons.push("environment_kill_switch_off");
  checks.intentAllowed = !input.intent || (policy.socialAi?.allowedIntents || []).length === 0 || policy.socialAi.allowedIntents.includes(input.intent); if (!checks.intentAllowed) reasons.push("intent_not_allowed");
  const threshold = Number(policy.socialAi?.confidenceThreshold) || .78; checks.confidence = input.confidence == null || Number(input.confidence) >= threshold; if (!checks.confidence) reasons.push("confidence_below_threshold");
  const providerMutation = ["meta_reply", "social_publish"].includes(input.action); checks.providerCapability = !providerMutation || !policy.requireProviderCapability || input.connection?.capabilityGranted === true; if (!checks.providerCapability) reasons.push("provider_capability_missing");
  checks.selectedAsset = !providerMutation || !policy.requireSelectedAsset || input.connection?.selectedAsset === true; if (!checks.selectedAsset) reasons.push("selected_asset_required");
  checks.messagingWindow = input.action !== "meta_reply" || !policy.requireMessagingWindow || input.conversation?.messagingWindowOpen === true; if (!checks.messagingWindow) reasons.push("messaging_window_closed");
  const now = dependencies.now || new Date(), hour = new Date(now.getTime() - 3600000), day = new Date(now.getTime() - 86400000), cooldown = new Date(now.getTime() - policy.conversationCooldownMinutes * 60000);
  const [hourly, daily, recent] = await Promise.all([Runs.countDocuments({ workspaceId: input.workspaceId, createdAt: { $gte: hour }, status: { $nin: ["blocked"] } }), Runs.countDocuments({ workspaceId: input.workspaceId, createdAt: { $gte: day }, status: { $nin: ["blocked"] } }), input.conversationId && policy.conversationCooldownMinutes ? Runs.countDocuments({ workspaceId: input.workspaceId, conversationId: input.conversationId, actionType: input.action, createdAt: { $gte: cooldown }, status: { $nin: ["blocked", "failed"] } }) : 0]);
  checks.hourlyLimit = hourly < policy.maxActionsPerHour; checks.dailyLimit = daily < policy.maxActionsPerDay; checks.cooldown = recent === 0;
  if (!checks.hourlyLimit) reasons.push("hourly_limit_reached"); if (!checks.dailyLimit) reasons.push("daily_limit_reached"); if (!checks.cooldown) reasons.push("conversation_cooldown_active");
  if (input.action === "social_ai_analysis") { try { await (dependencies.aiConfigService || aiConfigService).assertEnabled({ workspaceId: input.workspaceId, agent: "social" }); checks.aiBudget = true; } catch (error) { checks.aiBudget = false; reasons.push(error.code === "AI_MONTHLY_LIMIT_REACHED" ? "ai_budget_exhausted" : "ai_disabled"); } } else checks.aiBudget = true;
  const hardBlock = !checks.workspaceBound || !checks.actorAuthorized || !checks.automationEnabled || !checks.featureEnabled || !checks.actionFeatureEnabled || !checks.aiBudget || !checks.intentAllowed || !checks.confidence || !checks.hourlyLimit || !checks.dailyLimit || !checks.cooldown;
  const providerBlock = !checks.environmentKillSwitch || !checks.providerCapability || !checks.selectedAsset || !checks.messagingWindow;
  let mode = hardBlock || providerBlock ? "blocked" : input.action === "social_ai_analysis" ? "automatic" : input.approvalGranted ? "automatic" : policy.humanApprovalRequired ? "approval_required" : "automatic";
  const productionMode = mode;
  if (policy.dryRun && checks.workspaceBound && checks.actorAuthorized && checks.automationEnabled && checks.featureEnabled && checks.actionFeatureEnabled) mode = "dry_run";
  return { allowed: mode === "automatic", mode, productionMode, reasons, checks, policyVersion: VERSION };
}
module.exports = { VERSION, defaults, environmentAllows, evaluateAutomationAction, get, save };
