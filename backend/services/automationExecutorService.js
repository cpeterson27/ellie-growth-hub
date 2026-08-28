const AutomationActionRun = require("../models/AutomationActionRun");
const SocialProviderEvent = require("../models/SocialProviderEvent");
const SocialConnection = require("../models/SocialConnection");
const ConversationThread = require("../models/ConversationThread");
const ContentBrief = require("../models/ContentBrief");
const SocialAiAnalysis = require("../models/SocialAiAnalysis");
const metaAutomationReplyService = require("./metaAutomationReplyService");
const socialPublishingService = require("./socialPublishingService");
const socialAiService = require("./socialAiService");
const socialConnectionHealth = require("./socialConnectionHealth");

async function preflight(run) {
  const connection = run.provider ? await SocialConnection.findOne({ workspaceId: run.workspaceId, provider: { $in: [run.provider, "meta"] }, status: "connected" }).lean() : null;
  const selected = new Set((connection?.selectedAssetIds || []).map(String));
  const assetId = String(run.proposedPayload?.assetId || "");
  const conversation = run.conversationId ? await ConversationThread.findOne({ _id: run.conversationId, workspaceId: run.workspaceId }).select("metadata.messagingWindowExpiresAt metadata.assetId status").lean() : null;
  return { connection: { capabilityGranted: Boolean(connection && socialConnectionHealth.usable(connection)), selectedAsset: Boolean(connection && assetId && selected.has(assetId)) }, conversation: { messagingWindowOpen: Boolean(conversation?.metadata?.messagingWindowExpiresAt && new Date(conversation.metadata.messagingWindowExpiresAt) > new Date()) } };
}
const executors = {
  meta_reply: async ({ workspaceId, payload }) => { const event = await SocialProviderEvent.findOne({ _id: payload.socialProviderEventId, workspaceId, processingStatus: "processed" }); if (!event) throw Object.assign(new Error("Social provider event is unavailable"), { status: 404 }); return metaAutomationReplyService.deliver(event); },
  social_publish: async ({ workspaceId, payload }) => { const item = await ContentBrief.findOne({ _id: payload.contentBriefId, workspaceId, type: "social" }); if (!item) throw Object.assign(new Error("Social content is unavailable"), { status: 404 }); return { category: (await socialPublishingService.processItem(item)).status }; },
  crm_qualify: async ({ workspaceId, actor, payload }) => { const analysis = await SocialAiAnalysis.findOne({ _id: payload.analysisId, workspaceId }); if (!analysis) throw Object.assign(new Error("Social analysis is unavailable"), { status: 404 }); const context = await socialAiService.sanitizedContext({ workspaceId, threadId: payload.conversationId }); const opportunity = await socialAiService.qualify({ workspaceId, userId: actor.userId || null, context, analysis }); return { category: opportunity ? "crm_qualified" : "no_qualification_change" }; },
};
async function executeRequest({ workspaceId, runId, approvalId, confirmation, actor }, actionService) { const run = await AutomationActionRun.findOne({ _id: runId, workspaceId }); if (!run) throw Object.assign(new Error("Automation action not found"), { status: 404 }); const checks = await preflight(run); return actionService.executeApproved({ workspaceId, runId, approvalId, confirmation, actor, executors }, checks); }
module.exports = { executeRequest, executors, preflight };
