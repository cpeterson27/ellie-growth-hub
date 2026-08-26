const crypto = require("crypto");
const axios = require("axios");
const ConversationThread = require("../../models/ConversationThread");
const SocialConnection = require("../../models/SocialConnection");
const { decryptCredentials } = require("../../utils/credentialEncryption");
const { ConversationChannelAdapter, registerConversationAdapter } = require("./channelAdapters");
const { ingestProviderMessage } = require("./conversationIngestionService");
const { ingestSocialEvent } = require("../socialLeadAutomationService");

function validateMetaSignature(rawBody, signature, secretName = "META_APP_SECRET") {
  const secret = String(process.env[secretName] || "").trim();
  const supplied = String(signature || "").replace(/^sha256=/, "");
  if (!secret || !rawBody || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

async function connectionForAsset(assetId, provider = null) {
  return SocialConnection.findOne({ provider: provider || { $in: ["meta", "instagram"] }, status: "connected", selectedAssetIds: String(assetId) }).select("+credentialsEncrypted");
}

function assetChannel(connection, assetId) {
  const asset = connection.assets.find((item) => String(item.id) === String(assetId));
  return asset?.type === "instagram_business" ? "instagram" : "facebook";
}

async function ingestMetaMessage({ connection, assetId, event }) {
  if (!event?.message?.mid || event.message.is_echo) return null;
  const channel = assetChannel(connection, assetId);
  const senderId = String(event.sender?.id || ""); const recipientId = String(event.recipient?.id || assetId);
  const storyReply = Boolean(event.message.reply_to?.story || event.message.attachments?.some((item) => item.type === "story_mention"));
  return ingestSocialEvent({ provider: channel, providerEventId: event.message.mid, eventType: storyReply ? "story_reply" : "dm_received", triggerType: storyReply ? "story_reply" : "dm_keyword", assetId: String(assetId), providerUserId: senderId, providerThreadId: `${channel}:${assetId}:${senderId}`, messageId: event.message.mid, text: event.message.text || "", occurredAt: event.timestamp ? new Date(Number(event.timestamp)) : new Date(), sourceMetadata: { recipientId, quickReply: event.message.quick_reply?.payload || "" }, raw: event });
}

async function ingestMetaComment({ connection, assetId, change }) {
  const value = change?.value || {};
  const channel = assetChannel(connection, assetId);
  const commentId = String(value.id || value.comment_id || value.commentId || "");
  const from = value.from || value.sender || {};
  const providerUserId = String(from.id || value.from_id || value.user_id || "");
  if (!commentId || !providerUserId || !["instagram", "facebook"].includes(channel)) return null;
  return ingestSocialEvent({ provider: channel, providerEventId: `comment:${commentId}`, eventType: "comment_received", triggerType: "comment_any", assetId: String(assetId), providerUserId, username: from.username || "", displayName: from.name || "", contentId: String(value.media?.id || value.media_id || value.post_id || value.post?.id || ""), text: value.text || value.message || "", occurredAt: value.created_time ? new Date(Number(value.created_time) * (String(value.created_time).length <= 10 ? 1000 : 1)) : new Date(), sourceMetadata: { commentId }, raw: change });
}

class MetaMessagingAdapter extends ConversationChannelAdapter {
  constructor() { super("social", "meta"); }
  async status(connection) {
    const scopes = new Set(connection?.scopes || []);
    return { connected: connection?.status === "connected", webhookConfigured: Boolean(String((connection?.provider === "instagram" ? process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN : process.env.META_WEBHOOK_VERIFY_TOKEN) || "").trim()), facebookMessaging: scopes.has("pages_messaging"), instagramMessaging: scopes.has("instagram_manage_messages") || scopes.has("instagram_business_manage_messages"), selectedAssets: connection?.selectedAssetIds?.length || 0 };
  }
  async sendMessage({ channel, assetId, recipientId, body, threadId, workspaceId, userId = null, senderType = "automation" }) {
    const connection = await connectionForAsset(assetId);
    if (!connection || !connection.selectedAssetIds.includes(String(assetId))) throw new Error("The Meta asset is not connected and selected");
    const thread = threadId ? await ConversationThread.findById(threadId).lean() : null;
    if (!thread || (workspaceId && String(thread.workspaceId) !== String(workspaceId)) || String(connection.workspaceId) !== String(thread.workspaceId)) throw new Error("Social conversation is not in this workspace");
    if (thread.channel !== channel || String(thread.metadata?.assetId) !== String(assetId) || !thread.participants?.some(person => String(person.address) === String(recipientId) && person.kind === "contact")) throw new Error("Recipient and asset must match the existing social conversation");
    if (!String(body || "").trim() || String(body).length > 2000) throw new Error("Reply must contain 1–2000 characters");
    if (thread.metadata?.interactionType === "comment") throw new Error("Comments require a permitted comment/private-reply action, not a free-form DM");
    if (!thread?.lastInboundAt || Date.now() - new Date(thread.lastInboundAt).getTime() > 24 * 60 * 60 * 1000) throw new Error("Meta free-form replies require a customer message within the last 24 hours");
    const credentials = decryptCredentials(connection.credentialsEncrypted);
    const asset = connection.assets.find((item) => String(item.id) === String(assetId));
    const pageId = asset?.type === "instagram_business" ? asset.parentId : assetId;
    const token = credentials.pageTokens?.[String(pageId)] || credentials.accessToken;
    const version = require("../socialProviderConfig").graphVersion();
    if (!token || !version) throw new Error("Meta messaging credentials are unavailable");
    const response = await axios.post(`https://${connection.provider === "instagram" ? "graph.instagram.com" : "graph.facebook.com"}/${version}/${assetId}/messages`, { recipient: { id: recipientId }, message: { text: String(body || "").trim() } }, { params: { access_token: token }, timeout: 15000 });
    return ingestProviderMessage({ thread: { channel, provider: "meta", providerThreadId: thread.providerThreadId, participants: thread.participants, contactIds: thread.contactIds, organizationId: thread.organizationId, metadata: { assetId } }, message: { providerMessageId: response.data?.message_id || `meta:${crypto.randomUUID()}`, direction: "outbound", body, createdBy: userId, sender: { address: String(assetId) }, recipients: [{ address: String(recipientId), role: "to" }], deliveryStatus: "sent", metadata: { assetId, senderType } } });
  }
  async sendCommentPrivateReply({ assetId, commentId, body, occurredAt }) {
    if (!commentId || !String(body || "").trim()) throw new Error("A comment and response are required");
    if (occurredAt && Date.now() - new Date(occurredAt).getTime() > 7 * 24 * 60 * 60 * 1000) throw new Error("Instagram comment private replies must be sent within 7 days");
    const connection = await connectionForAsset(assetId);
    if (!connection) throw new Error("The Meta asset is not connected");
    const credentials = decryptCredentials(connection.credentialsEncrypted);
    const asset = connection.assets.find((item) => String(item.id) === String(assetId));
    if (!["instagram_business", "facebook_page"].includes(asset?.type)) throw new Error("Private comment replies require a connected Meta professional asset");
    const pageId = asset.type === "instagram_business" ? asset.parentId : asset.id;
    const token = credentials.pageTokens?.[String(pageId)] || credentials.accessToken;
    const version = require("../socialProviderConfig").graphVersion();
    if (!token || !version) throw new Error("Meta messaging credentials are unavailable");
    return axios.post(`https://${connection.provider === "instagram" ? "graph.instagram.com" : "graph.facebook.com"}/${version}/${assetId}/messages`, { recipient: { comment_id: commentId }, message: { text: String(body).trim() } }, { params: { access_token: token }, timeout: 15000 });
  }
}

const metaMessagingAdapter = registerConversationAdapter(new MetaMessagingAdapter());
module.exports = { MetaMessagingAdapter, assetChannel, connectionForAsset, ingestMetaComment, ingestMetaMessage, metaMessagingAdapter, validateMetaSignature };
