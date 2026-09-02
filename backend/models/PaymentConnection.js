const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const paymentConnectionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  provider: { type: String, enum: ["square"], required: true, default: "square" },
  status: { type: String, enum: ["connected", "attention_required", "expired", "disconnected"], default: "connected", index: true },
  externalMerchantId: { type: String, default: "", trim: true },
  externalLocationId: { type: String, default: "", trim: true },
  merchantName: { type: String, default: "", trim: true, maxlength: 180 },
  locationName: { type: String, default: "", trim: true, maxlength: 180 },
  scopes: { type: [String], default: [] },
  capabilities: { type: mongoose.Schema.Types.Mixed, default: {} },
  credentialsEncrypted: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  tokenExpiresAt: { type: Date, default: null },
  connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  connectedAt: { type: Date, default: Date.now },
  lastVerifiedAt: { type: Date, default: null },
  disconnectedAt: { type: Date, default: null },
  lastErrorCategory: { type: String, default: "", maxlength: 100 },
}, { timestamps: true, collection: "payment_connections" });

paymentConnectionSchema.index({ workspaceId: 1, provider: 1 }, { unique: true });
paymentConnectionSchema.index({ provider: 1, externalMerchantId: 1 }, { unique: true, partialFilterExpression: { externalMerchantId: { $type: "string", $gt: "" }, status: { $in: ["connected", "attention_required", "expired"] } } });
paymentConnectionSchema.plugin(workspacePlugin);
module.exports = mongoose.model("PaymentConnection", paymentConnectionSchema);
