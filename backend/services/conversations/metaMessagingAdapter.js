const crypto = require("crypto");
const axios = require("axios");
const ConversationThread = require("../../models/ConversationThread");
const SocialConnection = require("../../models/SocialConnection");
const { decryptCredentials } = require("../../utils/credentialEncryption");
const { ConversationChannelAdapter, registerConversationAdapter } = require("./channelAdapters");
const { ingestProviderMessage } = require("./conversationIngestionService");

function validateMetaSignature(rawBody, signature) {
  const secret = String(process.env.META_APP_SECRET || "").trim();
  const supplied = String(signature || "").replace(/^sha256=/, "");
  if (!secret || !rawBody || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

async function connectionForAsset(assetId) {
  return SocialConnection.findOne({ provider: "meta", status: "connected", selectedAssetIds: String(assetId) }).select("+credentialsEncrypted");
}

function assetChannel(connection, assetId) {
  const asset = connection.assets.find((item) => String(item.id) === String(assetId));
  return asset?.type === "instagram_business" ? "instagram" : "facebook";
}

async function ingestMetaMessage({ connection, assetId, event }) {
  if (!event?.message?.mid || event.message.is_echo) return null;
  const channel = assetChannel(connection, assetId);
  const senderId = String(event.sender?.id || ""); const recipientId = String(event.recipient?.id || assetId);
  return ingestProviderMessage({ thread: { channel, provider: "meta", providerThreadId: `${channel}:${assetId}:${senderId}`, participants: [{ kind: "external", role: "from", address: senderId }, { kind: "user", role: "to", address: recipientId }], metadata: { assetId } }, message: { providerMessageId: event.message.mid, direction: "inbound", body: event.message.text || "", sender: { address: senderId }, recipients: [{ address: recipientId, role: "to" }], attachments: (event.message.attachments || []).map((item) => ({ contentType: item.type || "", url: item.payload?.url || "" })), deliveryStatus: "received", sentAt: event.timestamp ? new Date(Number(event.timestamp)) : new Date(), metadata: { assetId, quickReply: event.message.quick_reply?.payload || "" } } });
}

class MetaMessagingAdapter extends ConversationChannelAdapter {
  constructor() { super("social", "meta"); }
  async status(connection) {
    const scopes = new Set(connection?.scopes || []);
    return { connected: connection?.status === "connected", webhookConfigured: Boolean(String(process.env.META_WEBHOOK_VERIFY_TOKEN || "").trim()), facebookMessaging: scopes.has("pages_messaging"), instagramMessaging: scopes.has("instagram_manage_messages") || scopes.has("instagram_business_manage_messages"), selectedAssets: connection?.selectedAssetIds?.length || 0 };
  }
  async sendMessage({ channel, assetId, recipientId, body, threadId }) {
    const connection = await connectionForAsset(assetId);
    if (!connection || !connection.selectedAssetIds.includes(String(assetId))) throw new Error("The Meta asset is not connected and selected");
    const thread = threadId ? await ConversationThread.findById(threadId).lean() : null;
    if (!thread?.lastInboundAt || Date.now() - new Date(thread.lastInboundAt).getTime() > 24 * 60 * 60 * 1000) throw new Error("Meta free-form replies require a customer message within the last 24 hours");
    const credentials = decryptCredentials(connection.credentialsEncrypted);
    const asset = connection.assets.find((item) => String(item.id) === String(assetId));
    const pageId = asset?.type === "instagram_business" ? asset.parentId : assetId;
    const token = credentials.pageTokens?.[String(pageId)] || credentials.accessToken;
    const version = String(process.env.META_GRAPH_API_VERSION || "").trim();
    if (!token || !version) throw new Error("Meta messaging credentials are unavailable");
    const response = await axios.post(`https://graph.facebook.com/${version}/${assetId}/messages`, { recipient: { id: recipientId }, message: { text: String(body || "").trim() } }, { params: { access_token: token }, timeout: 15000 });
    return ingestProviderMessage({ thread: { channel, provider: "meta", providerThreadId: thread.providerThreadId, participants: thread.participants, contactIds: thread.contactIds, organizationId: thread.organizationId, metadata: { assetId } }, message: { providerMessageId: response.data?.message_id || `meta:${crypto.randomUUID()}`, direction: "outbound", body, sender: { address: String(assetId) }, recipients: [{ address: String(recipientId), role: "to" }], deliveryStatus: "sent", metadata: { assetId } } });
  }
}

const metaMessagingAdapter = registerConversationAdapter(new MetaMessagingAdapter());
module.exports = { MetaMessagingAdapter, assetChannel, connectionForAsset, ingestMetaMessage, metaMessagingAdapter, validateMetaSignature };
