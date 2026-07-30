const express = require("express");
const { Resend } = require("resend");
const Outreach = require("../models/Outreach");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const EmailEvent = require("../models/EmailEvent");
const { classifyReply, draftReply } = require("../services/replyIntelligence");

const router = express.Router();

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
      if (recorded.duplicate) return res.json({ received: true, duplicate: true });
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
          },
        },
      );
      if (lifecycle.metric && firstOccurrence) {
        await Campaign.updateOne(
          { _id: outreach.campaignId },
          { $inc: { [`metrics.${lifecycle.metric}`]: 1 } },
        );
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
              : { status: "invalid" },
          },
        );
      }
      return res.json({ received: true, matched: true });
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
