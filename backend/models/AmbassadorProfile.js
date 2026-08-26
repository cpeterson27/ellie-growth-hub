const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  displayName: { type: String, required: true, trim: true, maxlength: 160 },
  status: { type: String, enum: ["invited", "active", "inactive"], default: "invited", index: true },
  referralCode: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  referralSlug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  commissionConfig: {
    mode: { type: String, enum: ["manual", "percent", "fixed"], default: "manual" },
    rateBps: { type: Number, default: 0, min: 0, max: 10000 },
    fixedAmountMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "USD", uppercase: true, maxlength: 3 },
  },
  communityUrl: { type: String, default: "", trim: true, maxlength: 1000 },
  startDate: { type: Date, default: Date.now },
  notes: { type: String, default: "", trim: true, maxlength: 5000 },
  bio: { type: String, default: "", trim: true, maxlength: 3000 },
  publicLocation: { type: String, default: "", trim: true, maxlength: 200 },
  company: { type: String, default: "", trim: true, maxlength: 240 },
  phone: { type: String, default: "", trim: true, maxlength: 80 },
  timezone: { type: String, default: "", trim: true, maxlength: 100 },
  website: { type: String, default: "", trim: true, maxlength: 1000 },
  socialProfiles: { instagram: { type: String, default: "", maxlength: 1000 }, facebook: { type: String, default: "", maxlength: 1000 }, linkedin: { type: String, default: "", maxlength: 1000 }, x: { type: String, default: "", maxlength: 1000 } },
  notificationPreferences: { email: { type: Boolean, default: true }, inApp: { type: Boolean, default: true } },
  welcomePost: { status: { type: String, enum: ["not_ready", "waiting_for_profile", "draft_generated", "ready_for_review", "scheduled", "published"], default: "waiting_for_profile" }, contentBriefId: { type: mongoose.Schema.Types.ObjectId, ref: "ContentBrief", default: null }, generatedAt: { type: Date, default: null }, publishedAt: { type: Date, default: null } },
  deactivatedAt: { type: Date, default: null },
}, { timestamps: true, collection: "ambassador_profiles" });
schema.index({ workspaceId: 1, userId: 1 }, { unique: true });
schema.index({ workspaceId: 1, referralCode: 1 }, { unique: true });
schema.index({ workspaceId: 1, referralSlug: 1 }, { unique: true });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("AmbassadorProfile", schema);
