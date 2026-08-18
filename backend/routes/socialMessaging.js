const crypto = require("crypto");
const express = require("express");
const ConversationMessage = require("../models/ConversationMessage");
const ConversationThread = require("../models/ConversationThread");
const SocialConnection = require("../models/SocialConnection");
const { metaMessagingAdapter } = require("../services/conversations/metaMessagingAdapter");

const router = express.Router();
router.get("/status", async (_req, res) => {
  const connection = await SocialConnection.findOne({ provider: "meta" }).lean();
  res.json({ success: true, meta: await metaMessagingAdapter.status(connection), linkedin: { mode: "human_assisted", privateMessageApiEnabled: false } });
});
router.post("/meta/send", async (req, res) => {
  if (req.body?.approved !== true) return res.status(400).json({ success: false, error: "Explicit reply approval is required" });
  if (!["facebook", "instagram"].includes(req.body?.channel)) return res.status(400).json({ success: false, error: "Facebook or Instagram is required" });
  try { res.status(201).json({ success: true, data: await metaMessagingAdapter.sendMessage(req.body) }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});
router.post("/linkedin/manual-actions", async (req, res) => {
  const action = String(req.body?.action || "drafted");
  if (!["drafted", "copied", "sent_manually", "replied_manually"].includes(action)) return res.status(400).json({ success: false, error: "Unsupported LinkedIn action" });
  let thread = req.body?.threadId ? await ConversationThread.findById(req.body.threadId) : null;
  if (!thread) thread = await ConversationThread.create({ channel: "linkedin", provider: "linkedin_manual", providerThreadId: `linkedin-manual:${crypto.randomUUID()}`, subject: String(req.body?.subject || "LinkedIn outreach").slice(0, 500), contactIds: req.body?.contactId ? [req.body.contactId] : [], organizationId: req.body?.organizationId || null, status: "open", metadata: { humanAssisted: true } });
  const message = await ConversationMessage.create({ threadId: thread._id, channel: "linkedin", provider: "linkedin_manual", providerMessageId: `linkedin-action:${crypto.randomUUID()}`, direction: "internal", kind: "note", body: String(req.body?.body || action).slice(0, 50000), deliveryStatus: "received", createdBy: req.auth?.user?._id || null, metadata: { action, humanAssisted: true } });
  res.status(201).json({ success: true, data: { thread, message }, providerActionTaken: false });
});
module.exports = router;
