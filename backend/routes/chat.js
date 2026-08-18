const express = require("express");
const ChatWidget = require("../models/ChatWidget");
const ConversationMessage = require("../models/ConversationMessage");
const ConversationMailbox = require("../models/ConversationMailbox");
const { runWithWorkspace } = require("../tenancy/workspaceContext");
const { addAgentMessage, addVisitorMessage, createVisitorSession, originAllowed, visitorSession } = require("../services/websiteChatService");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
const rateBuckets = new Map();
function publicRateLimit(req, res, next) {
  const key = String(req.ip || req.socket?.remoteAddress || "unknown");
  const now = Date.now(); const current = rateBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60000 } : current;
  bucket.count += 1; rateBuckets.set(key, bucket);
  if (rateBuckets.size > 10000) for (const [bucketKey, value] of rateBuckets) if (value.resetAt <= now) rateBuckets.delete(bucketKey);
  if (bucket.count > 60) return res.status(429).json({ error: "Too many chat requests" });
  next();
}
router.use("/widget", publicRateLimit);
function token(req) { return String(req.get("authorization") || "").replace(/^Bearer\s+/i, "") || String(req.body?.sessionToken || ""); }
async function publicWidget(req, res) {
  const widget = await ChatWidget.findOne({ key: req.params.key, enabled: true }).lean();
  if (!widget || !originAllowed(widget, req.get("origin"))) { res.status(404).json({ error: "Chat is unavailable" }); return null; }
  return widget;
}

router.get("/widget/:key/config", async (req, res) => {
  const widget = await publicWidget(req, res); if (!widget) return;
  res.json({ name: widget.name, greeting: widget.greeting, offlineMessage: widget.offlineMessage, accentColor: widget.accentColor, requireEmail: widget.requireEmail });
});

router.post("/widget/:key/session", async (req, res) => {
  const widget = await publicWidget(req, res); if (!widget) return;
  if (widget.requireEmail && !String(req.body?.email || "").includes("@")) return res.status(400).json({ error: "Email is required" });
  const result = await runWithWorkspace(widget.workspaceId, () => createVisitorSession(widget, req.body || {}));
  res.status(201).json({ sessionToken: result.token, threadId: result.thread._id, expiresAt: result.session.expiresAt });
});

router.get("/widget/:key/messages", async (req, res) => {
  const widget = await publicWidget(req, res); if (!widget) return;
  const session = await runWithWorkspace(widget.workspaceId, () => visitorSession(token(req)));
  if (!session || String(session.widgetId) !== String(widget._id)) return res.status(401).json({ error: "Chat session expired" });
  const data = await runWithWorkspace(widget.workspaceId, () => ConversationMessage.find({ threadId: session.threadId, direction: { $ne: "internal" } }).select("direction body createdAt deliveryStatus").sort({ createdAt: 1 }).limit(500).lean());
  res.json({ data });
});

router.post("/widget/:key/messages", async (req, res) => {
  const widget = await publicWidget(req, res); if (!widget) return;
  const session = await runWithWorkspace(widget.workspaceId, () => visitorSession(token(req)));
  if (!session || String(session.widgetId) !== String(widget._id)) return res.status(401).json({ error: "Chat session expired" });
  try { res.status(201).json({ data: await runWithWorkspace(widget.workspaceId, () => addVisitorMessage(session, req.body?.body)) }); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.get("/manage/widgets", async (_req, res) => res.json({ success: true, data: await ChatWidget.find({}).sort({ createdAt: 1 }).lean() }));
router.post("/manage/widgets", requireRole("owner", "admin"), async (req, res) => {
  const allowedOrigins = Array.isArray(req.body?.allowedOrigins) ? req.body.allowedOrigins.slice(0, 20).map((value) => String(value).replace(/\/$/, "")).filter((value) => /^https?:\/\//.test(value)) : [];
  if (!allowedOrigins.length) return res.status(400).json({ success: false, error: "At least one allowed website origin is required" });
  const mailbox = await ConversationMailbox.create({ provider: "website_chat", providerAccountId: "local", name: String(req.body?.name || "Website chat"), address: `widget:${Date.now()}`, shared: true });
  const widget = await ChatWidget.create({ name: String(req.body?.name || "Website chat"), allowedOrigins, greeting: req.body?.greeting, requireEmail: req.body?.requireEmail === true, mailboxId: mailbox._id });
  res.status(201).json({ success: true, data: widget });
});
router.patch("/manage/widgets/:id", requireRole("owner", "admin"), async (req, res) => {
  const allowed = ["name", "enabled", "allowedOrigins", "greeting", "offlineMessage", "accentColor", "requireEmail"];
  const update = Object.fromEntries(allowed.filter((key) => req.body?.[key] !== undefined).map((key) => [key, req.body[key]]));
  if (update.allowedOrigins) {
    update.allowedOrigins = Array.isArray(update.allowedOrigins) ? update.allowedOrigins.slice(0, 20).map((value) => String(value).replace(/\/$/, "")).filter((value) => /^https?:\/\//.test(value)) : [];
    if (!update.allowedOrigins.length) return res.status(400).json({ success: false, error: "At least one allowed website origin is required" });
  }
  const widget = await ChatWidget.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!widget) return res.status(404).json({ success: false, error: "Chat widget not found" });
  res.json({ success: true, data: widget });
});
router.post("/manage/threads/:id/messages", async (req, res) => {
  if (req.body?.approved !== true) return res.status(400).json({ success: false, error: "Explicit reply approval is required" });
  const message = await addAgentMessage(req.params.id, req.body?.body, req.auth?.user?._id);
  if (!message) return res.status(404).json({ success: false, error: "Website chat not found" });
  res.status(201).json({ success: true, data: message });
});

module.exports = router;
