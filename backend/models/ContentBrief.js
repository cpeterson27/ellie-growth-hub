const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const contentBriefSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ["email", "email_template", "social", "landing_page", "ad", "brief"], default: "brief" },
  body: { type: String, required: true },
  subject: { type: String, default: "" },
  callToAction: { type: String, default: "" },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  source: { type: String, enum: ["manual", "human", "jarvis", "campaign"], default: "human" },
  status: { type: String, enum: ["draft", "pending_approval", "approved", "scheduled", "publishing", "published", "rejected", "failed", "archived"], default: "draft", index: true },
  social: {
    destinations: { type: [{ _id: false, provider: { type: String, enum: ["facebook", "instagram", "linkedin", "x", "tiktok"], required: true }, assetId: { type: String, default: "", maxlength: 255 }, mode: { type: String, enum: ["api", "human_assisted", "unavailable"], default: "unavailable" } }], default: [] },
    media: { type: [{ _id: false, type: { type: String, enum: ["image", "video"], default: "image" }, url: { type: String, required: true, maxlength: 2000 }, alt: { type: String, default: "", maxlength: 500 } }], default: [] },
    cta: { label: { type: String, default: "", maxlength: 120 }, url: { type: String, default: "", maxlength: 2000 } },
    requestedPublishAt: { type: Date, default: null, index: true },
    approval: { requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, requestedAt: { type: Date, default: null }, approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, approvedAt: { type: Date, default: null }, rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, rejectedAt: { type: Date, default: null }, rejectionReason: { type: String, default: "", maxlength: 1000 } },
    editHistory: { type: [{ _id: false, editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, editedAt: { type: Date, default: Date.now }, before: { type: mongoose.Schema.Types.Mixed, default: {} } }], default: [] },
    publications: { type: [{ _id: false, provider: String, assetId: String, status: { type: String, enum: ["pending", "published", "failed", "cancelled"], default: "pending" }, idempotencyKey: String, providerPostId: String, publicUrl: String, publishedAt: Date, lastAttemptAt: Date, attempts: { type: [{ _id: false, attemptedAt: { type: Date, default: Date.now }, status: String, error: String, providerPostId: String }], default: [] } }], default: [] },
    lastError: { type: String, default: "", maxlength: 2000 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "content_briefs" });

contentBriefSchema.plugin(workspacePlugin);
contentBriefSchema.index({ workspaceId: 1, type: 1, status: 1, "social.requestedPublishAt": 1 });
module.exports = mongoose.model("ContentBrief", contentBriefSchema);
