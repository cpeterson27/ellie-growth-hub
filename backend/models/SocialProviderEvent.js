const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  provider: { type: String, enum: ["instagram", "facebook", "tiktok", "linkedin", "x", "manychat"], required: true },
  providerEventId: { type: String, required: true, trim: true },
  eventType: { type: String, enum: ["dm_received", "comment_received", "story_reply", "mention_received", "postback_received", "referral_received", "optin_received", "message_reaction", "message_read", "message_seen", "message_delivered", "customer_information", "lead_form_received", "lead_form", "link_clicked"], required: true },
  sourceMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  reply: {
    status: { type: String, enum: ["none", "pending", "sending", "sent", "unknown", "blocked"], default: "none" },
    body: { type: String, default: "", maxlength: 4000 },
    policy: { type: String, default: "none" },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationThread", default: null },
    assetId: String, recipientId: String, commentId: String, connectionProvider: String,
    messageId: String, attemptedAt: Date, sentAt: Date,
    error: { type: String, default: "", maxlength: 300 },
  },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  socialIdentityId: { type: mongoose.Schema.Types.ObjectId, ref: "SocialIdentity", default: null },
  automationId: { type: mongoose.Schema.Types.ObjectId, ref: "SocialAutomation", default: null },
  contentBriefId: { type: mongoose.Schema.Types.ObjectId, ref: "ContentBrief", default: null, index: true },
  payloadHash: { type: String, default: "" },
  occurredAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null },
  processingStatus: { type: String, enum: ["processing", "processed", "failed"], default: "processing" },
  processingStartedAt: { type: Date, default: Date.now },
  lastError: { type: String, default: "", maxlength: 300 },
}, { timestamps: true, collection: "social_provider_events" });

schema.index({ workspaceId: 1, provider: 1, providerEventId: 1 }, { unique: true });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("SocialProviderEvent", schema);
