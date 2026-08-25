const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrationConnection", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  automationId: { type: mongoose.Schema.Types.ObjectId, ref: "Automation", default: null },
  automationExecutionId: { type: mongoose.Schema.Types.ObjectId, ref: "AutomationExecution", default: null },
  action: { type: String, enum: ["create_event", "update_event", "announce_event"], required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["pending_approval", "approved", "completed", "rejected", "failed"], default: "pending_approval", index: true },
  idempotencyKey: { type: String, required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  requestedAt: { type: Date, default: Date.now },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  rejectedAt: { type: Date, default: null },
  providerResult: { type: mongoose.Schema.Types.Mixed, default: null },
  lastError: { type: String, default: "", maxlength: 1000 },
}, { timestamps: true, collection: "meetup_action_requests" });
schema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("MeetupActionRequest", schema);
