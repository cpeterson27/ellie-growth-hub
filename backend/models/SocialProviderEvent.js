const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  provider: { type: String, enum: ["instagram", "facebook", "tiktok", "linkedin", "x", "manychat"], required: true },
  providerEventId: { type: String, required: true, trim: true },
  eventType: { type: String, enum: ["dm_received", "comment_received", "story_reply", "lead_form", "link_clicked"], required: true },
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
