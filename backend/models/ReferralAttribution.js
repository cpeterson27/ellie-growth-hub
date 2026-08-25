const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  coachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", required: true, index: true },
  coachUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  referralCode: { type: String, required: true, trim: true, lowercase: true }, source: { type: String, default: "manual", trim: true, maxlength: 80 },
  attributedAt: { type: Date, default: Date.now, required: true }, correctedAt: { type: Date, default: null },
  correctionReason: { type: String, default: "", trim: true, maxlength: 2000 },
  previousCoachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "referral_attributions" });
schema.index({ workspaceId: 1, contactId: 1 }, { unique: true }); schema.plugin(workspacePlugin);
module.exports = mongoose.model("ReferralAttribution", schema);
