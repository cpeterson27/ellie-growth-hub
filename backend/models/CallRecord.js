const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const callRecordSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationThread", default: null, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
  provider: { type: String, enum: ["twilio", "manual"], default: "twilio" },
  providerCallId: { type: String, default: "", trim: true },
  from: { type: String, required: true, trim: true },
  to: { type: String, required: true, trim: true },
  direction: { type: String, enum: ["inbound", "outbound"], required: true },
  status: { type: String, enum: ["queued", "ringing", "in_progress", "completed", "busy", "no_answer", "failed", "canceled"], default: "queued", index: true },
  startedAt: { type: Date, default: null }, answeredAt: { type: Date, default: null }, endedAt: { type: Date, default: null }, durationSeconds: { type: Number, default: 0, min: 0 },
  recording: { consentConfirmed: { type: Boolean, default: false }, status: { type: String, enum: ["disabled", "pending", "processing", "completed", "failed"], default: "disabled" }, providerRecordingId: { type: String, default: "" }, url: { type: String, default: "" }, durationSeconds: { type: Number, default: 0 } },
  transcription: { status: { type: String, enum: ["disabled", "pending", "processing", "completed", "failed"], default: "disabled" }, text: { type: String, default: "", maxlength: 500000 }, providerTranscriptionId: { type: String, default: "" } },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "call_records" });

callRecordSchema.index({ workspaceId: 1, provider: 1, providerCallId: 1 }, { unique: true, partialFilterExpression: { providerCallId: { $type: "string", $gt: "" } } });
callRecordSchema.plugin(workspacePlugin);
module.exports = mongoose.model("CallRecord", callRecordSchema);
