const express = require("express");
const mongoose = require("mongoose");
const ConversationThread = require("../models/ConversationThread");
const ConversationMessage = require("../models/ConversationMessage");

const router = express.Router();
const statuses = new Set(["open", "pending", "snoozed", "closed", "spam"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);

function validId(value) { return mongoose.Types.ObjectId.isValid(String(value || "")); }
function userId(req) { return req.auth?.user?._id || null; }

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 30));
    const query = {};
    if (statuses.has(req.query.status)) query.status = req.query.status;
    if (req.query.channel) query.channel = String(req.query.channel);
    if (req.query.assignedTo === "me") query.assignedTo = userId(req);
    else if (req.query.assignedTo === "unassigned") query.assignedTo = null;
    if (req.query.unread === "true") query.unreadCount = { $gt: 0 };
    const search = String(req.query.search || "").trim().slice(0, 120);
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = ["subject", "preview", "participants.name", "participants.address"].map((field) => ({ [field]: { $regex: escaped, $options: "i" } }));
    }
    const [total, data] = await Promise.all([
      ConversationThread.countDocuments(query),
      ConversationThread.find(query).populate("contactIds", "name email company").populate("assignedTo", "name email").sort({ lastMessageAt: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch {
    res.status(500).json({ success: false, error: "Failed to load conversations" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ success: false, error: "Conversation not found" });
    const thread = await ConversationThread.findById(req.params.id).populate("contactIds", "name email company title").populate("organizationId", "name domain").populate("assignedTo", "name email").lean();
    if (!thread) return res.status(404).json({ success: false, error: "Conversation not found" });
    const messages = await ConversationMessage.find({ threadId: thread._id }).populate("createdBy", "name email").sort({ createdAt: 1 }).limit(1000).lean();
    res.json({ success: true, data: { thread, messages } });
  } catch {
    res.status(500).json({ success: false, error: "Failed to load conversation" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ success: false, error: "Conversation not found" });
    const update = {};
    if (req.body.status !== undefined) {
      if (!statuses.has(req.body.status)) return res.status(400).json({ success: false, error: "Invalid conversation status" });
      update.status = req.body.status;
      update.snoozedUntil = req.body.status === "snoozed" ? new Date(req.body.snoozedUntil) : null;
      if (req.body.status === "snoozed" && Number.isNaN(update.snoozedUntil.getTime())) return res.status(400).json({ success: false, error: "A valid snooze time is required" });
    }
    if (req.body.priority !== undefined) {
      if (!priorities.has(req.body.priority)) return res.status(400).json({ success: false, error: "Invalid conversation priority" });
      update.priority = req.body.priority;
    }
    if (req.body.assignedTo !== undefined) {
      if (req.body.assignedTo && !validId(req.body.assignedTo)) return res.status(400).json({ success: false, error: "Invalid assignee" });
      update.assignedTo = req.body.assignedTo || null;
    }
    if (req.body.markRead === true) update.unreadCount = 0;
    if (!Object.keys(update).length) return res.status(400).json({ success: false, error: "No supported changes supplied" });
    const thread = await ConversationThread.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean();
    if (!thread) return res.status(404).json({ success: false, error: "Conversation not found" });
    await ConversationMessage.create({ threadId: thread._id, channel: thread.channel, direction: "internal", kind: update.assignedTo !== undefined ? "assignment" : "status", body: "Conversation workspace updated", deliveryStatus: "received", createdBy: userId(req) });
    res.json({ success: true, data: thread });
  } catch {
    res.status(500).json({ success: false, error: "Failed to update conversation" });
  }
});

router.put("/:id/draft", async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ success: false, error: "Conversation not found" });
    const body = String(req.body?.body || "");
    const subject = String(req.body?.subject || "");
    if (body.length > 50000 || subject.length > 500) return res.status(400).json({ success: false, error: "Draft is too long" });
    const thread = await ConversationThread.findByIdAndUpdate(req.params.id, { $set: { draft: { body, subject, attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 20) : [], updatedBy: userId(req), updatedAt: new Date() } } }, { new: true }).lean();
    if (!thread) return res.status(404).json({ success: false, error: "Conversation not found" });
    res.json({ success: true, data: thread.draft });
  } catch {
    res.status(500).json({ success: false, error: "Failed to save draft" });
  }
});

router.post("/:id/notes", async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ success: false, error: "Conversation not found" });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ success: false, error: "Note text is required" });
    const thread = await ConversationThread.findById(req.params.id).lean();
    if (!thread) return res.status(404).json({ success: false, error: "Conversation not found" });
    const note = await ConversationMessage.create({ threadId: thread._id, channel: thread.channel, direction: "internal", kind: "note", body, deliveryStatus: "received", createdBy: userId(req) });
    res.status(201).json({ success: true, data: note });
  } catch {
    res.status(500).json({ success: false, error: "Failed to add internal note" });
  }
});

module.exports = router;
