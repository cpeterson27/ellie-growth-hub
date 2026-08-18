const express = require("express");
const CallRecord = require("../models/CallRecord");
const CommunicationConsent = require("../models/CommunicationConsent");
const MessagingSender = require("../models/MessagingSender");
const { evaluateOutboundCommunication, normalizePhone } = require("../services/communicationPolicyService");
const { twilioConversationAdapter } = require("../services/conversations/twilioConversationAdapter");
const { ingestProviderMessage } = require("../services/conversations/conversationIngestionService");
const { requireRole } = require("../middleware/auth");

const router = express.Router();
function callbackUrl(path) { return `${String(process.env.PUBLIC_BACKEND_URL || "").replace(/\/$/, "")}/api/webhooks/twilio/${path}`; }

router.get("/status", async (_req, res) => {
  const [provider, senders] = await Promise.all([twilioConversationAdapter.status(), MessagingSender.find({}).lean()]);
  res.json({ success: true, provider, senders, readiness: { canSend: provider.configured && senders.some((item) => item.status === "active"), requiresA2pForUsMarketing: true, purchaseEnabled: false } });
});

router.post("/senders", requireRole("owner", "admin"), async (req, res) => {
  const phoneNumber = normalizePhone(req.body?.phoneNumber);
  if (!phoneNumber) return res.status(400).json({ success: false, error: "A valid E.164 phone number is required" });
  const sender = await MessagingSender.findOneAndUpdate({ phoneNumber }, { $set: { phoneNumber, provider: "twilio", providerNumberId: String(req.body?.providerNumberId || ""), messagingServiceId: String(req.body?.messagingServiceId || ""), capabilities: { sms: req.body?.capabilities?.sms === true, mms: req.body?.capabilities?.mms === true, voice: req.body?.capabilities?.voice === true }, status: req.body?.status === "active" ? "active" : "pending" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.status(201).json({ success: true, data: sender });
});

router.patch("/senders/:id", requireRole("owner", "admin"), async (req, res) => {
  const update = {};
  if (req.body.status !== undefined && ["pending", "active", "paused", "released"].includes(req.body.status)) update.status = req.body.status;
  if (req.body.a2p !== undefined) update.a2p = req.body.a2p;
  if (req.body.quietHours !== undefined) update.quietHours = req.body.quietHours;
  if (req.body.recordingPolicy !== undefined) update.recordingPolicy = req.body.recordingPolicy;
  if (req.body.transcriptionPolicy !== undefined) update.transcriptionPolicy = req.body.transcriptionPolicy;
  const sender = await MessagingSender.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!sender) return res.status(404).json({ success: false, error: "Sending number not found" });
  res.json({ success: true, data: sender });
});

router.get("/consents", async (req, res) => {
  const query = {};
  if (req.query.address) query.address = normalizePhone(req.query.address);
  if (req.query.channel) query.channel = req.query.channel;
  res.json({ success: true, data: await CommunicationConsent.find(query).sort({ updatedAt: -1 }).limit(500).lean() });
});

router.post("/consents", async (req, res) => {
  const address = normalizePhone(req.body?.address);
  if (!address || !["sms", "mms", "voice"].includes(req.body?.channel) || !["unknown", "opted_in", "opted_out"].includes(req.body?.status)) return res.status(400).json({ success: false, error: "Valid address, channel, and status are required" });
  if (req.body.status === "opted_in" && !String(req.body?.proof || "").trim()) return res.status(400).json({ success: false, error: "Consent proof is required for opt-in" });
  const now = new Date();
  const data = await CommunicationConsent.findOneAndUpdate({ channel: req.body.channel, address, purpose: req.body.purpose || "all" }, { $set: { contactId: req.body.contactId || null, status: req.body.status, source: req.body.source || "manual", proof: String(req.body.proof || ""), purpose: req.body.purpose || "all", consentedAt: req.body.status === "opted_in" ? now : null, revokedAt: req.body.status === "opted_out" ? now : null, recordedBy: req.auth?.user?._id || null } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.status(201).json({ success: true, data });
});

router.post("/messages/preview", async (req, res) => {
  const sender = await MessagingSender.findById(req.body?.senderId).lean();
  if (!sender) return res.status(404).json({ success: false, error: "Sending number not found" });
  const policy = await evaluateOutboundCommunication({ channel: req.body?.mediaUrls?.length ? "mms" : "sms", address: req.body?.to, purpose: req.body?.purpose || "transactional", sender, timezone: req.body?.timezone });
  res.json({ success: true, policy, estimatedSegments: Math.max(1, Math.ceil(String(req.body?.body || "").length / 160)) });
});

router.post("/messages/send", async (req, res) => {
  if (req.body?.approved !== true) return res.status(400).json({ success: false, error: "Explicit send approval is required" });
  const sender = await MessagingSender.findById(req.body?.senderId).lean();
  if (!sender) return res.status(404).json({ success: false, error: "Sending number not found" });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ success: false, error: "Message body is required" });
  try {
    const result = await twilioConversationAdapter.sendMessage({ sender, to: req.body.to, body, mediaUrls: req.body.mediaUrls || [], purpose: req.body.purpose || "transactional", timezone: req.body.timezone, statusCallback: callbackUrl("message-status") });
    const to = normalizePhone(req.body.to); const channel = req.body.mediaUrls?.length ? "mms" : "sms";
    const saved = await ingestProviderMessage({ thread: { channel, provider: "twilio", providerThreadId: `${channel}:${to}:${sender.phoneNumber}`, participants: [{ kind: "user", role: "from", address: sender.phoneNumber }, { kind: "external", role: "to", address: to }], contactIds: req.body.contactId ? [req.body.contactId] : [], organizationId: req.body.organizationId || null }, message: { providerMessageId: result.sid, direction: "outbound", body, sender: { address: sender.phoneNumber }, recipients: [{ address: to, role: "to" }], attachments: (req.body.mediaUrls || []).map((url) => ({ url })), deliveryStatus: "queued", contactId: req.body.contactId || null } });
    res.status(201).json({ success: true, data: saved.message, providerStatus: result.status });
  } catch (error) { res.status(error.code === "COMMUNICATION_BLOCKED" ? 409 : 400).json({ success: false, error: error.message, code: error.code || "PROVIDER_ERROR" }); }
});

router.post("/whatsapp/send", async (req, res) => {
  if (req.body?.approved !== true) return res.status(400).json({ success: false, error: "Explicit send approval is required" });
  const sender = await MessagingSender.findById(req.body?.senderId).lean();
  if (!sender?.capabilities?.whatsapp) return res.status(400).json({ success: false, error: "A WhatsApp-enabled sender is required" });
  try {
    const result = await twilioConversationAdapter.sendWhatsApp({ sender, to: req.body.to, body: req.body.body, contentSid: req.body.contentSid, contentVariables: req.body.contentVariables, purpose: req.body.purpose || "transactional", timezone: req.body.timezone, statusCallback: callbackUrl("message-status"), threadId: req.body.threadId });
    const to = normalizePhone(req.body.to);
    const saved = await ingestProviderMessage({ thread: { channel: "whatsapp", provider: "twilio", providerThreadId: `whatsapp:${to}:${sender.phoneNumber}`, participants: [{ kind: "user", role: "from", address: sender.phoneNumber }, { kind: "external", role: "to", address: to }], contactIds: req.body.contactId ? [req.body.contactId] : [], organizationId: req.body.organizationId || null }, message: { providerMessageId: result.sid, direction: "outbound", body: String(req.body.body || `[Template ${req.body.contentSid}]`), sender: { address: sender.phoneNumber }, recipients: [{ address: to, role: "to" }], deliveryStatus: "queued", contactId: req.body.contactId || null, metadata: { contentSid: req.body.contentSid || "", template: Boolean(req.body.contentSid) } } });
    res.status(201).json({ success: true, data: saved.message, providerStatus: result.status });
  } catch (error) { res.status(error.code === "COMMUNICATION_BLOCKED" ? 409 : 400).json({ success: false, error: error.message, code: error.code || "PROVIDER_ERROR" }); }
});

router.get("/calls", async (_req, res) => res.json({ success: true, data: await CallRecord.find({}).populate("contactId", "name phone").sort({ createdAt: -1 }).limit(500).lean() }));

router.post("/calls", async (req, res) => {
  if (req.body?.approved !== true) return res.status(400).json({ success: false, error: "Explicit call approval is required" });
  const sender = await MessagingSender.findById(req.body?.senderId).lean();
  if (!sender?.capabilities?.voice) return res.status(400).json({ success: false, error: "A voice-capable active number is required" });
  const policy = await evaluateOutboundCommunication({ channel: "voice", address: req.body?.to, purpose: req.body?.purpose || "transactional", sender, timezone: req.body?.timezone });
  if (!policy.allowed) return res.status(409).json({ success: false, error: policy.reasons.join("; "), code: "COMMUNICATION_BLOCKED" });
  const record = req.body?.record === true;
  if (record && req.body?.recordingConsentConfirmed !== true) return res.status(400).json({ success: false, error: "Recording consent must be confirmed before placing a recorded call" });
  const twimlUrl = String(sender.metadata?.twimlUrl || process.env.TWILIO_TWIML_URL || "").trim();
  if (!twimlUrl) return res.status(400).json({ success: false, error: "An approved TwiML application URL is not configured" });
  const result = await twilioConversationAdapter.placeCall({ sender, to: policy.address, twimlUrl, statusCallback: callbackUrl("call-status"), recordingStatusCallback: callbackUrl("recording-status"), record });
  const call = await CallRecord.create({ contactId: req.body.contactId || null, organizationId: req.body.organizationId || null, provider: "twilio", providerCallId: result.sid, from: sender.phoneNumber, to: policy.address, direction: "outbound", status: "queued", recording: { consentConfirmed: record, status: record ? "pending" : "disabled" }, transcription: { status: record && sender.transcriptionPolicy?.mode === "automatic" ? "pending" : "disabled" }, createdBy: req.auth?.user?._id || null });
  res.status(201).json({ success: true, data: call });
});

module.exports = router;
