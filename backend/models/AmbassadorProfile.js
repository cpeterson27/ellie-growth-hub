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
  deactivatedAt: { type: Date, default: null },
}, { timestamps: true, collection: "ambassador_profiles" });
schema.index({ workspaceId: 1, userId: 1 }, { unique: true });
schema.index({ workspaceId: 1, referralCode: 1 }, { unique: true });
schema.index({ workspaceId: 1, referralSlug: 1 }, { unique: true });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("AmbassadorProfile", schema);
