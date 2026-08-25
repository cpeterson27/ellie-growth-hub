const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  idempotencyKey: { type: String, default: "", trim: true, maxlength: 500 },
  destination: { type: String, required: true, trim: true, maxlength: 2000 },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  automationId: { type: mongoose.Schema.Types.ObjectId, ref: "SocialAutomation", default: null },
  provider: { type: String, enum: ["instagram", "facebook", "tiktok", "linkedin", "x"], required: true },
  assetId: { type: String, default: "" },
  contentId: { type: String, default: "" },
  referralCode: { type: String, default: "" },
  utm: { source: String, medium: String, campaign: String, content: String, term: String },
  clickCount: { type: Number, default: 0 },
  firstClickedAt: { type: Date, default: null },
  lastClickedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "tracked_links" });

schema.plugin(workspacePlugin);
schema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $gt: "" } } });
module.exports = mongoose.model("TrackedLink", schema);
