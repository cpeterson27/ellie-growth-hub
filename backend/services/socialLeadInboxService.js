const mongoose = require("mongoose");
const SocialIdentity = require("../models/SocialIdentity");
const SocialProviderEvent = require("../models/SocialProviderEvent");
const ConversationThread = require("../models/ConversationThread");
const models = { SocialIdentity, SocialProviderEvent, ConversationThread };

async function list(workspaceId, query = {}, deps = models) {
  if (!mongoose.Types.ObjectId.isValid(String(workspaceId || ""))) throw new Error("A valid workspace is required");
  const scope = { workspaceId };
  if (["instagram", "facebook", "linkedin", "x", "tiktok"].includes(query.provider)) scope.provider = query.provider;
  const limit = Math.max(1, Math.min(Number(query.limit) || 100, 250));
  const identities = await deps.SocialIdentity.find(scope)
    .populate({ path: "contactId", match: { workspaceId }, select: "name email status type stage qualifyContact researchStatus socialAttribution" })
    .sort({ lastActivityAt: -1 }).limit(limit).lean();
  if (!identities.length) return [];
  const events = await deps.SocialProviderEvent.aggregate([
    { $match: { workspaceId: new mongoose.Types.ObjectId(String(workspaceId)), socialIdentityId: { $in: identities.map(row => row._id) } } },
    { $sort: { occurredAt: -1 } },
    { $group: { _id: "$socialIdentityId", event: { $first: { eventType: "$eventType", occurredAt: "$occurredAt", contentBriefId: "$contentBriefId", sourceMetadata: "$sourceMetadata", threadId: "$reply.threadId" } } } },
  ]);
  const byIdentity = new Map(events.map(row => [String(row._id), row.event]));
  const threadIds = events.map(row => row.event.threadId).filter(Boolean);
  const threads = threadIds.length ? await deps.ConversationThread.find({ workspaceId, _id: { $in: threadIds } })
    .select("preview status lastMessageAt unreadCount assignedTo").populate("assignedTo", "name").lean() : [];
  const byThread = new Map(threads.map(row => [String(row._id), row]));
  return identities.filter(row => row.contactId).map(row => {
    const event = byIdentity.get(String(row._id));
    const thread = byThread.get(String(event?.threadId));
    return { ...row, latestInteraction: event ? { type: event.eventType, occurredAt: event.occurredAt, contentBriefId: event.contentBriefId || null, hasSourcePost: Boolean(event.sourceMetadata?.contentId) } : null,
      conversation: thread ? { id: thread._id, preview: thread.preview, status: thread.status, lastMessageAt: thread.lastMessageAt, unreadCount: thread.unreadCount, assignedTo: thread.assignedTo ? { id: thread.assignedTo._id, name: thread.assignedTo.name } : null } : null };
  });
}
module.exports = { list };
