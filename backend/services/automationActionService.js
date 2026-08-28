const crypto = require("crypto");
const AutomationActionRun = require("../models/AutomationActionRun");
const GrowthActionApproval = require("../models/GrowthActionApproval");
const InAppNotification = require("../models/InAppNotification");
const automationPolicyService = require("./automationPolicyService");

const SECRET_KEYS = /token|secret|credential|authorization|password|api.?key|raw|payload/i;
function sanitize(value, depth = 0) {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map(item => sanitize(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEYS.test(key)).map(([key, item]) => [key, sanitize(item, depth + 1)]));
  return typeof value === "string" ? value.slice(0, 1000) : value;
}
function idempotencyKey(input) { return crypto.createHash("sha256").update([input.workspaceId, input.triggerType, input.triggerId, input.conversationId || "", input.actionType, input.policyVersion || automationPolicyService.VERSION].join(":"), "utf8").digest("hex"); }
function retryDecision(error, attemptCount, maxRetries, random = Math.random) {
  const status = Number(error?.response?.status || error?.status || 0), code = String(error?.code || "");
  const uncertain = ["ETIMEDOUT", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT"].includes(code) || error?.uncertain === true;
  if (uncertain) return { retry: false, uncertain: true, category: "provider_outcome_uncertain" };
  const retryable = status === 429 || status >= 500 || ["EAI_AGAIN", "ECONNREFUSED"].includes(code);
  if (!retryable || attemptCount >= maxRetries) return { retry: false, uncertain: false, category: retryable ? "retry_limit_reached" : "non_retryable_failure" };
  const base = Math.min(300000, 1000 * (2 ** Math.max(0, attemptCount - 1))), delayMs = Math.round(base * (.75 + random() * .5));
  return { retry: true, uncertain: false, category: "retryable_failure", delayMs };
}
async function notifyAttention(run, category, deps) {
  if (!deps.InAppNotification?.findOneAndUpdate) return;
  await deps.InAppNotification.findOneAndUpdate({ workspaceId: run.workspaceId, userId: null, eventKey: `automation:${run._id}:${category}` }, { $setOnInsert: { type: "social_automation_attention", title: "Social automation needs attention", message: String(category).replaceAll("_", " "), actionUrl: "/social/settings" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}
async function propose(input, dependencies = {}) {
  const Runs = dependencies.AutomationActionRun || AutomationActionRun, policyService = dependencies.policyService || automationPolicyService;
  const policy = input.policy || await policyService.get(input.workspaceId), key = input.idempotencyKey || idempotencyKey({ ...input, policyVersion: policyService.VERSION });
  const existing = await Runs.findOne({ workspaceId: input.workspaceId, idempotencyKey: key }); if (existing) return { run: existing, reused: true };
  const decision = await policyService.evaluateAutomationAction({ ...input, action: input.actionType, policy }, dependencies);
  const status = decision.mode === "dry_run" ? "dry_run" : decision.mode === "approval_required" ? "approval_required" : decision.mode === "automatic" ? "ready" : "blocked";
  try {
    const run = await Runs.create({ workspaceId: input.workspaceId, actorType: input.actor.actorType, principal: input.actor.principal || "", userId: input.actor.userId || null, triggerType: input.triggerType, triggerId: input.triggerId, agent: input.agent || "", actionType: input.actionType, provider: input.provider || "", targetType: input.targetType || "", targetId: input.targetId || "", conversationId: input.conversationId || null, status, policyDecision: decision, proposedPayload: sanitize(input.proposedPayload || {}), idempotencyKey: key, policyVersion: decision.policyVersion, correlationId: input.correlationId || "" });
    if (["blocked"].includes(status) && decision.reasons.some(reason => ["ai_budget_exhausted", "hourly_limit_reached", "daily_limit_reached"].includes(reason))) await notifyAttention(run, decision.reasons[0], { InAppNotification: dependencies.InAppNotification || InAppNotification });
    return { run, reused: false };
  } catch (error) { if (error?.code !== 11000) throw error; return { run: await Runs.findOne({ workspaceId: input.workspaceId, idempotencyKey: key }), reused: true }; }
}
async function prepareApproval({ workspaceId, runId, userId }, dependencies = {}) {
  const Runs = dependencies.AutomationActionRun || AutomationActionRun, Approvals = dependencies.GrowthActionApproval || GrowthActionApproval;
  const run = await Runs.findOne({ _id: runId, workspaceId, status: "approval_required" }); if (!run) throw Object.assign(new Error("Action is not awaiting approval"), { code: "AUTOMATION_APPROVAL_UNAVAILABLE" });
  const phrase = `APPROVE ${String(run._id).slice(-6).toUpperCase()}`;
  const approval = await Approvals.create({ workspaceId, userId, action: "execute_automation_action", payload: { automationActionRunId: run._id, idempotencyKey: run.idempotencyKey }, summary: { actionType: run.actionType, targetType: run.targetType, targetId: run.targetId }, confirmationPhrase: phrase, expiresAt: new Date(Date.now() + 15 * 60000) });
  run.approvalId = approval._id; await run.save(); return { approvalId: approval._id, confirmationPhrase: phrase, expiresAt: approval.expiresAt };
}
async function executeApproved({ workspaceId, runId, approvalId, confirmation, actor, executors = {} }, dependencies = {}) {
  const Runs = dependencies.AutomationActionRun || AutomationActionRun, Approvals = dependencies.GrowthActionApproval || GrowthActionApproval, policyService = dependencies.policyService || automationPolicyService;
  const run = await Runs.findOne({ _id: runId, workspaceId, approvalId, status: "approval_required" }); if (!run) throw Object.assign(new Error("Approved action not found in this workspace"), { code: "AUTOMATION_ACTION_FORBIDDEN" });
  const approval = await Approvals.findOne({ _id: approvalId, workspaceId, userId: actor.userId, action: "execute_automation_action", usedAt: null, expiresAt: { $gt: new Date() } });
  if (!approval || String(approval.payload?.automationActionRunId) !== String(run._id) || approval.payload?.idempotencyKey !== run.idempotencyKey || confirmation !== approval.confirmationPhrase) throw Object.assign(new Error("Valid action-specific approval is required"), { code: "AUTOMATION_APPROVAL_INVALID" });
  const policy = await policyService.get(workspaceId), decision = await policyService.evaluateAutomationAction({ workspaceId, actor, action: run.actionType, approvalGranted: true, provider: run.provider, conversationId: run.conversationId, policy, connection: dependencies.connection, conversation: dependencies.conversation }, dependencies);
  run.policyDecision = decision;
  if (decision.mode !== "automatic") { run.status = decision.mode === "dry_run" ? "dry_run" : "blocked"; run.failureCategory = decision.reasons[0] || "policy_blocked"; await run.save(); return run; }
  const executor = executors[run.actionType]; if (!executor) throw Object.assign(new Error("No approved existing service is registered for this action"), { code: "AUTOMATION_EXECUTOR_UNAVAILABLE" });
  run.status = "executing"; run.startedAt = new Date(); run.attemptCount += 1; await run.save();
  try { const result = await executor({ workspaceId, actor, payload: run.proposedPayload, idempotencyKey: run.idempotencyKey }); run.status = "succeeded"; run.providerResultCategory = result?.category || "confirmed"; run.completedAt = new Date(); approval.usedAt = new Date(); await approval.save(); await run.save(); return run; }
  catch (error) { const retry = retryDecision(error, run.attemptCount, policy.maxRetries); run.status = retry.uncertain ? "uncertain" : "failed"; run.failureCategory = retry.category; run.nextAttemptAt = retry.retry ? new Date(Date.now() + retry.delayMs) : null; run.completedAt = new Date(); await run.save(); if (retry.uncertain || !retry.retry) await notifyAttention(run, retry.category, { InAppNotification: dependencies.InAppNotification || InAppNotification }); return run; }
}
module.exports = { executeApproved, idempotencyKey, prepareApproval, propose, retryDecision, sanitize };
