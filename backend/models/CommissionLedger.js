const mongoose = require("mongoose"); const workspacePlugin = require("../tenancy/workspacePlugin");
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true }, referralAttributionId: { type: mongoose.Schema.Types.ObjectId, ref: "ReferralAttribution", required: true },
  beneficiaryType: { type: String, enum: ["coach", "ambassador"], default: "coach", index: true },
  coachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", default: null, index: true }, coachUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  ambassadorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "AmbassadorProfile", default: null, index: true }, ambassadorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  coachingProgramId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram", default: null, index: true }, productKey: { type: String, default: "", trim: true, lowercase: true, maxlength: 120 }, productLabel: { type: String, default: "", trim: true, maxlength: 180 },
  saleType: { type: String, enum: ["sales_opportunity", "stripe_payment", "skool_addon", "manual"], required: true }, saleReference: { type: String, required: true, trim: true, maxlength: 180 },
  grossAmountMinor: { type: Number, required: true, min: 0 }, rateBps: { type: Number, required: true, min: 0, max: 10000 }, commissionAmountMinor: { type: Number, required: true, min: 0 }, currency: { type: String, default: "USD", uppercase: true, trim: true, maxlength: 3 },
  status: { type: String, enum: ["pending", "approved", "paid", "void", "reversed"], default: "pending", index: true }, calculatedAt: { type: Date, default: Date.now, required: true },
  approvedAt: { type: Date, default: null }, paidAt: { type: Date, default: null }, reversedAt: { type: Date, default: null }, reversalReason: { type: String, default: "", trim: true, maxlength: 2000 },
  ruleSnapshot: { type: mongoose.Schema.Types.Mixed, required: true }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  payoutNotes: { type: String, default: "", trim: true, maxlength: 5000 },
}, { timestamps: true, collection: "commission_ledger" });
schema.index({ workspaceId: 1, saleType: 1, saleReference: 1 }, { unique: true }); schema.index({ workspaceId: 1, coachProfileId: 1, status: 1, calculatedAt: -1 }); schema.plugin(workspacePlugin);
schema.index({ workspaceId: 1, ambassadorProfileId: 1, status: 1, calculatedAt: -1 });
module.exports = mongoose.model("CommissionLedger", schema);
