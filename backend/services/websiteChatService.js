const crypto = require("crypto");
const ChatVisitorSession = require("../models/ChatVisitorSession");
const ChatWidget = require("../models/ChatWidget");
const ConversationMessage = require("../models/ConversationMessage");
const ConversationThread = require("../models/ConversationThread");
const Contact = require("../models/Contact");

function hashToken(token) { return crypto.createHash("sha256").update(String(token || "")).digest("hex"); }
function originAllowed(widget, origin) { return !widget.allowedOrigins?.length || widget.allowedOrigins.includes(String(origin || "").replace(/\/$/, "")); }

async function createVisitorSession(widget, profile = {}) {
  const email = String(profile.email || "").trim().toLowerCase();
  const contact = email ? await Contact.findOne({ email, status: { $ne: "archived" } }).select("_id organizationId").lean() : null;
  const thread = await ConversationThread.create({ channel: "chat", provider: "website_chat", providerThreadId: `web:${crypto.randomUUID()}`, subject: profile.name ? `Website chat with ${profile.name}` : "New website chat", participants: [{ kind: contact ? "contact" : "external", role: "participant", name: String(profile.name || "Visitor"), address: email, contactId: contact?._id || null }], contactIds: contact ? [contact._id] : [], organizationId: contact?.organizationId || null, status: "open", priority: "normal", metadata: { widgetId: widget._id, pageUrl: String(profile.pageUrl || "").slice(0, 2000) } });
  const token = crypto.randomBytes(32).toString("base64url");
  const session = await ChatVisitorSession.create({ widgetId: widget._id, threadId: thread._id, tokenHash: hashToken(token), name: String(profile.name || "").slice(0, 160), email, phone: String(profile.phone || "").slice(0, 80), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), metadata: { pageUrl: String(profile.pageUrl || "").slice(0, 2000) } });
  return { session, thread, token };
}

async function visitorSession(token) {
  if (!token) return null;
  return ChatVisitorSession.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).select("+tokenHash");
}

async function addVisitorMessage(session, body) {
  const text = String(body || "").trim().slice(0, 10000);
  if (!text) throw new Error("Message text is required");
  const message = await ConversationMessage.create({ threadId: session.threadId, channel: "chat", provider: "website_chat", providerMessageId: `webmsg:${crypto.randomUUID()}`, direction: "inbound", kind: "message", body: text, deliveryStatus: "received", sender: { name: session.name || "Visitor", address: session.email || "" } });
  await ConversationThread.updateOne({ _id: session.threadId }, { $set: { preview: text.slice(0, 1000), lastMessageAt: message.createdAt, lastInboundAt: message.createdAt, status: "open" }, $inc: { unreadCount: 1 } });
  session.lastSeenAt = new Date(); await session.save();
  return message;
}

async function addAgentMessage(threadId, body, userId) {
  const text = String(body || "").trim().slice(0, 10000);
  if (!text) throw new Error("Message text is required");
  const thread = await ConversationThread.findOne({ _id: threadId, provider: "website_chat" });
  if (!thread) return null;
  const message = await ConversationMessage.create({ threadId, channel: "chat", provider: "website_chat", providerMessageId: `webmsg:${crypto.randomUUID()}`, direction: "outbound", kind: "message", body: text, deliveryStatus: "delivered", createdBy: userId || null });
  await ConversationThread.updateOne({ _id: threadId }, { $set: { preview: text.slice(0, 1000), lastMessageAt: message.createdAt, lastOutboundAt: message.createdAt } });
  return message;
}

module.exports = { addAgentMessage, addVisitorMessage, createVisitorSession, hashToken, originAllowed, visitorSession };
