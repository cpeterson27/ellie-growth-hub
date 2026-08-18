const express = require("express");
const { Resend } = require("resend");
const Outreach = require("../models/Outreach");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const EmailEvent = require("../models/EmailEvent");
const EmailSuppression = require("../models/EmailSuppression");
const { classifyReply, draftReply } = require("../services/replyIntelligence");
const CallRecord = require("../models/CallRecord");
const CommunicationConsent = require("../models/CommunicationConsent");
const ConversationMessage = require("../models/ConversationMessage");
const MessageDeliveryEvent = require("../models/MessageDeliveryEvent");
const MessagingSender = require("../models/MessagingSender");
const { normalizePhone } = require("../services/communicationPolicyService");
const { twilioConversationAdapter, validateTwilioSignature } = require("../services/conversations/twilioConversationAdapter");
const { runWithWorkspace } = require("../tenancy/workspaceContext");
const { connectionForAsset, ingestMetaMessage, validateMetaSignature } = require("../services/conversations/metaMessagingAdapter");

const router = express.Router();

router.get("/meta", (req, res) => {
  const verifyToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || "").trim();
  if (verifyToken && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === verifyToken) return res.status(200).send(String(req.query["hub.challenge"] || ""));
  return res.status(403).send("Verification failed");
});

router.post("/meta", async (req, res) => {
  if (!validateMetaSignature(req.rawBody || JSON.stringify(req.body), req.get("x-hub-signature-256"))) return res.status(403).json({ error: "Invalid Meta signature" });
  try {
    for (const entry of req.body?.entry || []) {
      const connection = await connectionForAsset(entry.id);
      if (!connection?.workspaceId) continue;
      await runWithWorkspace(connection.workspaceId, async () => {
        for (const event of entry.messaging || []) await ingestMetaMessage({ connection, assetId: entry.id, event });
      });
    }
    res.json({ received: true });
  } catch (error) { console.error("META MESSAGING WEBHOOK ERROR:", error); res.status(500).json({ error: "Webhook failed" }); }
});

function twilioWebhookUrl(req) { return `${String(process.env.PUBLIC_BACKEND_URL || "").replace(/\/$/, "")}${req.originalUrl}`; }
function validTwilioRequest(req) { return validateTwilioSignature(twilioWebhookUrl(req), req.body || {}, String(req.get("x-twilio-signature") || "")); }
async function twilioSender(req) {
  const numbers = [req.body?.To, req.body?.From, req.body?.Called, req.body?.Caller].map(normalizePhone).filter(Boolean);
  return numbers.length ? MessagingSender.findOne({ phoneNumber: { $in: numbers } }).lean() : null;
}

router.post("/twilio/message-inbound", async (req, res) => {
  if (!validTwilioRequest(req)) return res.status(403).type("text/xml").send("<Response></Response>");
  const sender = await twilioSender(req);
  if (!sender?.workspaceId) return res.status(404).type("text/xml").send("<Response></Response>");
  try {
    await runWithWorkspace(sender.workspaceId, async () => {
      const from = normalizePhone(req.body.From);
      const consentChannel = /^whatsapp:/i.test(String(req.body.From || "")) ? "whatsapp" : "sms";
      const optOutType = String(req.body.OptOutType || "").toUpperCase();
      if (from && ["STOP", "START"].includes(optOutType)) {
        const optedOut = optOutType === "STOP";
        await CommunicationConsent.findOneAndUpdate({ channel: consentChannel, address: from, purpose: "all" }, { $set: { status: optedOut ? "opted_out" : "opted_in", source: "provider", proof: `Twilio Advanced Opt-Out ${optOutType}`, keyword: String(req.body.Body || "").slice(0, 80), consentedAt: optedOut ? null : new Date(), revokedAt: optedOut ? new Date() : null, metadata: { optOutType } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      }
      await twilioConversationAdapter.ingestInbound(req.body, sender);
    });
    return res.type("text/xml").send("<Response></Response>");
  } catch (error) { console.error("TWILIO INBOUND ERROR:", error); return res.status(500).type("text/xml").send("<Response></Response>"); }
});

router.post("/twilio/message-status", async (req, res) => {
  if (!validTwilioRequest(req)) return res.status(403).json({ error: "Invalid Twilio signature" });
  const sender = await twilioSender(req);
  if (!sender?.workspaceId) return res.status(404).json({ error: "Sending number not found" });
  await runWithWorkspace(sender.workspaceId, async () => {
    const providerMessageId = String(req.body.MessageSid || "");
    const status = String(req.body.MessageStatus || "unknown").toLowerCase();
    const message = await ConversationMessage.findOne({ provider: "twilio", providerMessageId });
    const deliveryStatus = { accepted: "queued", scheduled: "queued", queued: "queued", sending: "queued", sent: "sent", delivered: "delivered", read: "read", undelivered: "failed", failed: "failed" }[status] || "queued";
    if (message) { message.deliveryStatus = deliveryStatus; if (deliveryStatus === "delivered") message.deliveredAt = new Date(); if (deliveryStatus === "read") message.readAt = new Date(); await message.save(); }
    try { await MessageDeliveryEvent.create({ messageId: message?._id || null, provider: "twilio", providerMessageId, status, errorCode: String(req.body.ErrorCode || ""), errorMessage: String(req.body.ErrorMessage || ""), metadata: { channelPrefix: req.body.ChannelPrefix || "" } }); } catch (error) { if (error?.code !== 11000) throw error; }
  });
  res.json({ received: true });
});

router.post("/twilio/call-status", async (req, res) => {
  if (!validTwilioRequest(req)) return res.status(403).json({ error: "Invalid Twilio signature" });
  const sender = await twilioSender(req);
  if (!sender?.workspaceId) return res.status(404).json({ error: "Sending number not found" });
  await runWithWorkspace(sender.workspaceId, async () => {
    const status = String(req.body.CallStatus || "queued").replaceAll("-", "_");
    const update = { status, durationSeconds: Number(req.body.CallDuration || 0) };
    if (["ringing", "in_progress"].includes(status)) update.startedAt = new Date();
    if (status === "in_progress") update.answeredAt = new Date();
    if (["completed", "busy", "no_answer", "failed", "canceled"].includes(status)) update.endedAt = new Date();
    await CallRecord.updateOne({ provider: "twilio", providerCallId: req.body.CallSid }, { $set: update });
  });
  res.json({ received: true });
});

router.post("/twilio/recording-status", async (req, res) => {
  if (!validTwilioRequest(req)) return res.status(403).json({ error: "Invalid Twilio signature" });
  const sender = await twilioSender(req);
  if (!sender?.workspaceId) return res.status(404).json({ error: "Sending number not found" });
  await runWithWorkspace(sender.workspaceId, async () => {
    const rawStatus = String(req.body.RecordingStatus || "processing");
    const status = rawStatus === "completed" ? "completed" : rawStatus === "absent" ? "failed" : "processing";
    await CallRecord.updateOne({ provider: "twilio", providerCallId: req.body.CallSid }, { $set: { "recording.status": status, "recording.providerRecordingId": String(req.body.RecordingSid || ""), "recording.url": status === "completed" ? String(req.body.RecordingUrl || "") : "", "recording.durationSeconds": Number(req.body.RecordingDuration || 0) } });
  });
  res.json({ received: true });
});

function verifyResendEvent(req) {
  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) throw new Error("RESEND_WEBHOOK_SECRET is not configured");
  const resend = new Resend(String(process.env.RESEND_API_KEY || "").trim());
  return resend.webhooks.verify({
    payload: req.rawBody || JSON.stringify(req.body),
    headers: {
      id: req.get("svix-id"),
      timestamp: req.get("svix-timestamp"),
      signature: req.get("svix-signature"),
    },
    webhookSecret,
  });
}

function eventTime(event) {
  const parsed = new Date(event.created_at);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function recipientFrom(data = {}) {
  const value = Array.isArray(data.to) ? data.to[0] : data.to;
  return String(value || "").toLowerCase().trim();
}

async function recordProviderEvent(req, event, outreach = null) {
  const providerEventId = String(req.get("svix-id") || "").trim();
  if (!providerEventId) return { duplicate: false };
  try {
    await EmailEvent.create({
      providerEventId,
      messageId: String(event.data?.email_id || event.data?.id || ""),
      outreachId: outreach?._id || null,
      campaignId: outreach?.campaignId || null,
      type: event.type || "unknown",
      occurredAt: eventTime(event),
      recipient: recipientFrom(event.data),
    });
    return { duplicate: false };
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    throw error;
  }
}

const lifecycleEvents = {
  "email.delivered": { field: "deliveredAt", status: "delivered", metric: "delivered" },
  "email.opened": { field: "openedAt", metric: "opened" },
  "email.clicked": { field: "clickedAt", metric: "clicked" },
  "email.bounced": { field: "bouncedAt", status: "bounced", metric: "bounced" },
  "email.complained": { field: "complainedAt", status: "complained", metric: "complained" },
  "email.failed": { field: "failedAt", status: "failed" },
  "email.delivery_delayed": { status: "delayed" },
  "email.suppressed": { status: "suppressed" },
};

router.post("/resend", async (req, res) => {
  try {
    let event;
    try {
      event = verifyResendEvent(req);
    } catch (error) {
      console.warn("[Resend webhook] rejected", { message: error.message });
      return res.status(400).json({ error: "Invalid Resend webhook signature" });
    }

    const data = event.data || {};
    const messageId = String(data.email_id || data.id || "");
    const lifecycle = lifecycleEvents[event.type];

    if (lifecycle && messageId) {
      const outreach = await Outreach.findOne({ messageId });
      const recorded = await recordProviderEvent(req, event, outreach);
      if (!outreach) return res.json({ received: true, matched: false });

      const occurredAt = eventTime(event);
      let firstOccurrence = false;
      if (lifecycle.field) {
        const firstUpdate = await Outreach.updateOne(
          { _id: outreach._id, [lifecycle.field]: null },
          { $set: { [lifecycle.field]: occurredAt } },
        );
        firstOccurrence = firstUpdate.modifiedCount === 1;
      }
      await Outreach.updateOne(
        {
          _id: outreach._id,
          $or: [
            { lastEmailEventAt: null },
            { lastEmailEventAt: { $lte: occurredAt } },
          ],
        },
        {
          $set: {
            lastEmailEventAt: occurredAt,
            ...(lifecycle.status ? { deliveryStatus: lifecycle.status } : {}),
            ...(event.type === "email.bounced" ? {
              bounceType: String(data.bounce?.type || ""),
              bounceSubType: String(data.bounce?.subType || ""),
              bounceMessage: String(data.bounce?.message || ""),
            } : {}),
          },
        },
      );
      if (lifecycle.metric && firstOccurrence && !recorded.duplicate) {
        await Campaign.updateOne(
          { _id: outreach.campaignId },
          { $inc: { [`metrics.${lifecycle.metric}`]: 1 } },
        );
      }
      if (outreach.contactId && event.type === "email.delivered") {
        const globallySuppressed = await EmailSuppression.exists({
          email: String(outreach.contactEmail || "").toLowerCase().trim(),
        });
        if (!globallySuppressed) {
          await Contact.updateOne(
            { _id: outreach.contactId, emailBounced: { $ne: true } },
            {
              $set: {
                emailStatus: "verified",
                primaryEmailVerificationSource: "resend_delivery_confirmation",
                primaryEmailLastVerifiedAt: occurredAt,
              },
            },
          );
        }
      }
      if (outreach.contactId && ["email.bounced", "email.complained", "email.suppressed"].includes(event.type)) {
        const optedOut = event.type === "email.complained";
        await Contact.updateOne(
          { _id: outreach.contactId },
          {
            $set: optedOut
              ? {
                status: "unsubscribed",
                "emailPreferences.marketingStatus": "unsubscribed",
                "emailPreferences.unsubscribedAt": occurredAt,
                "emailPreferences.unsubscribeSource": "spam_complaint",
                "emailPreferences.topics.eventInvitations": false,
                "emailPreferences.topics.programOffers": false,
                "emailPreferences.topics.educationalNewsletter": false,
              }
              : {
                status: "invalid",
                emailStatus: "undeliverable",
                emailBounced: true,
              },
          },
        );
      }
      if (["email.bounced", "email.complained", "email.suppressed"].includes(event.type)) {
        const suppressedEmail = recipientFrom(data) || String(outreach.contactEmail || "").toLowerCase().trim();
        if (suppressedEmail) {
          await EmailSuppression.findOneAndUpdate(
            { email: suppressedEmail },
            {
              $set: {
                reason: event.type === "email.complained"
                  ? "complaint"
                  : event.type === "email.suppressed"
                    ? "provider_suppressed"
                    : "bounce",
                provider: "resend",
                bounceType: String(data.bounce?.type || ""),
                bounceSubType: String(data.bounce?.subType || ""),
                message: String(data.bounce?.message || ""),
                sourceOutreachId: outreach._id,
                suppressedAt: occurredAt,
              },
            },
            { upsert: true, new: true },
          );
        }
      }
      return res.json({ received: true, matched: true, duplicate: recorded.duplicate });
    }

    if (event.type !== "email.received") {
      const recorded = await recordProviderEvent(req, event);
      return res.json({ received: true, duplicate: recorded.duplicate });
    }

    const senderEmail = String(data.from || "")
      .replace(/^.*</, "")
      .replace(/>$/, "")
      .toLowerCase()
      .trim();
    const resend = new Resend(String(process.env.RESEND_API_KEY || "").trim());
    const received = messageId
      ? await resend.emails.receiving.get(messageId)
      : null;
    if (received?.error) {
      throw new Error(received.error.message || "Unable to retrieve received email content");
    }
    const replyText =
      received?.data?.text ||
      received?.data?.html ||
      data.subject ||
      "Reply received";
    const outreach = senderEmail
      ? await Outreach.findOne({
        contactEmail: senderEmail,
        status: { $in: ["sent", "replied"] },
      }).sort({ sentAt: -1 }).populate("campaignId", "name")
      : null;
    const recorded = await recordProviderEvent(req, event, outreach);
    if (recorded.duplicate) return res.json({ received: true, duplicate: true });
    if (!outreach) return res.json({ received: true, matched: false });

    const firstReply = outreach.status !== "replied";
    const intelligence = classifyReply(replyText);
    outreach.status = "replied";
    outreach.repliedAt = eventTime(event);
    outreach.replyText = String(replyText);
    outreach.replyCategory = intelligence.category;
    outreach.replyUrgency = intelligence.urgency;
    outreach.aiReplyDraft = draftReply({
      contactName: outreach.contactName,
      category: intelligence.category,
      campaignName: outreach.campaignId?.name,
    });
    await outreach.save();
    if (intelligence.category === "unsubscribe" && outreach.contactId) {
      await Contact.updateOne(
        { _id: outreach.contactId },
        {
          $set: {
            status: "unsubscribed",
            "emailPreferences.marketingStatus": "unsubscribed",
            "emailPreferences.unsubscribedAt": eventTime(event),
            "emailPreferences.unsubscribeSource": "reply_request",
            "emailPreferences.topics.eventInvitations": false,
            "emailPreferences.topics.programOffers": false,
            "emailPreferences.topics.educationalNewsletter": false,
          },
        },
      );
    }
    if (firstReply) {
      await Campaign.updateOne({ _id: outreach.campaignId?._id }, { $inc: { "metrics.replied": 1 } });
    }
    return res.json({ received: true, matched: true });
  } catch (error) {
    console.error("RESEND WEBHOOK ERROR:", error);
    return res.status(500).json({ error: "Webhook failed" });
  }
});

module.exports = router;
