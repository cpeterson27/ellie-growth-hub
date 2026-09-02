const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  provider: { type: String, enum: ["square"], required: true },
  eventId: { type: String, required: true },
  eventType: { type: String, required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", default: null, index: true },
  merchantId: { type: String, default: "", index: true },
  payloadDigest: { type: String, required: true },
  status: { type: String, enum: ["received", "processing", "processed", "ignored", "failed"], default: "received" },
  attempts: { type: Number, default: 1 },
  errorCategory: { type: String, default: "", maxlength: 120 },
  receivedAt: { type: Date, default: Date.now },
  processingAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
}, { timestamps: true, collection: "payment_webhook_events" });
schema.index({ provider: 1, eventId: 1 }, { unique: true });
module.exports = mongoose.model("PaymentWebhookEvent", schema);
