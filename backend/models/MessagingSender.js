const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const messagingSenderSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  provider: { type: String, enum: ["twilio"], default: "twilio" },
  phoneNumber: { type: String, required: true, trim: true, index: true },
  providerNumberId: { type: String, default: "", trim: true },
  messagingServiceId: { type: String, default: "", trim: true },
  capabilities: { sms: { type: Boolean, default: false }, mms: { type: Boolean, default: false }, voice: { type: Boolean, default: false } },
  status: { type: String, enum: ["pending", "active", "paused", "released"], default: "pending" },
  a2p: { status: { type: String, enum: ["not_required", "unregistered", "pending", "approved", "rejected"], default: "unregistered" }, brandId: { type: String, default: "" }, campaignId: { type: String, default: "" }, useCase: { type: String, default: "" } },
  quietHours: { enabled: { type: Boolean, default: true }, startHour: { type: Number, default: 21, min: 0, max: 23 }, endHour: { type: Number, default: 8, min: 0, max: 23 }, fallbackTimezone: { type: String, default: "America/Los_Angeles" } },
  recordingPolicy: { mode: { type: String, enum: ["disabled", "consent_required"], default: "disabled" }, playBeep: { type: Boolean, default: true }, disclosureText: { type: String, default: "" } },
  transcriptionPolicy: { mode: { type: String, enum: ["disabled", "manual", "automatic"], default: "disabled" }, retentionDays: { type: Number, default: 30, min: 1, max: 3650 } },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "messaging_senders" });

messagingSenderSchema.index({ workspaceId: 1, phoneNumber: 1 }, { unique: true });
messagingSenderSchema.plugin(workspacePlugin);
module.exports = mongoose.model("MessagingSender", messagingSenderSchema);
