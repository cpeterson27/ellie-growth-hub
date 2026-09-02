const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  paymentPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentPlan", required: true, index: true },
  installmentNumber: { type: Number, required: true, min: 1, max: 12 },
  status: { type: String, enum: ["scheduled", "due", "checkout_created", "pending", "paid", "failed", "past_due", "canceled", "partially_refunded", "refunded"], default: "scheduled", index: true },
  amountMinor: { type: Number, required: true, min: 1 },
  paidAmountMinor: { type: Number, default: 0, min: 0 }, refundedAmountMinor: { type: Number, default: 0, min: 0 },
  dueAt: { type: Date, required: true, index: true }, paidAt: { type: Date, default: null },
  idempotencyKey: { type: String, required: true, maxlength: 45 },
  paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentTransaction", default: null },
}, { timestamps: true, collection: "payment_installments" });
schema.index({ workspaceId: 1, paymentPlanId: 1, installmentNumber: 1 }, { unique: true, name: "plan_installment_number" });
schema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true, name: "workspace_installment_idempotency" });
schema.index({ workspaceId: 1, status: 1, dueAt: 1 }, { name: "installment_due_status" });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("PaymentInstallment", schema);
