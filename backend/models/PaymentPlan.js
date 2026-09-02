const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  provider: { type: String, enum: ["square"], required: true, default: "square" },
  status: { type: String, enum: ["draft", "active", "partially_paid", "paid", "past_due", "canceled", "refunded", "attention_required"], default: "draft", index: true },
  coachingApplicationId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingApplication", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  coachingProgramId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram", required: true, index: true },
  salesOpportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOpportunity", default: null },
  totalAmountMinor: { type: Number, required: true, min: 1 },
  paidAmountMinor: { type: Number, default: 0, min: 0 },
  refundedAmountMinor: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: "USD", uppercase: true, minlength: 3, maxlength: 3 },
  installmentCount: { type: Number, required: true, min: 2, max: 12 },
  publicAccessTokenHash: { type: String, required: true, select: false },
  publicAccessTokenEncrypted: { type: String, required: true, select: false },
  publicAccessExpiresAt: { type: Date, required: true, index: true },
  publicAccessRevokedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  canceledAt: { type: Date, default: null }, canceledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true, collection: "payment_plans" });
schema.index({ workspaceId: 1, createdAt: -1 }, { name: "workspace_payment_plans" });
schema.index({ workspaceId: 1, coachingApplicationId: 1 }, { unique: true, name: "application_active_payment_plan", partialFilterExpression: { status: { $in: ["draft", "active", "partially_paid", "past_due", "attention_required"] } } });
schema.index({ publicAccessTokenHash: 1 }, { unique: true, name: "payment_plan_public_token" });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("PaymentPlan", schema);
