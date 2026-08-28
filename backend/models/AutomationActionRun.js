const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  actorType: { type: String, enum: ["system", "user"], required: true },
  principal: { type: String, default: "", maxlength: 80 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  triggerType: { type: String, required: true, maxlength: 100 },
  triggerId: { type: String, required: true, maxlength: 300 },
  agent: { type: String, default: "", maxlength: 50 },
  actionType: { type: String, required: true, maxlength: 100, index: true },
  provider: { type: String, default: "", maxlength: 40 },
  targetType: { type: String, default: "", maxlength: 80 },
  targetId: { type: String, default: "", maxlength: 300 },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationThread", default: null, index: true },
  status: { type: String, enum: ["proposed", "policy_evaluated", "approval_required", "dry_run", "ready", "executing", "succeeded", "failed", "uncertain", "blocked"], default: "proposed", index: true },
  policyDecision: {
    mode: { type: String, enum: ["blocked", "dry_run", "approval_required", "automatic"], default: "blocked" },
    reasons: { type: [String], default: [] },
    checks: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  proposedPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowthActionApproval", default: null, index: true },
  idempotencyKey: { type: String, required: true, maxlength: 300 },
  policyVersion: { type: String, required: true, maxlength: 80 },
  attemptCount: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: null },
  providerResultCategory: { type: String, default: "", maxlength: 80 },
  failureCategory: { type: String, default: "", maxlength: 120 },
  correlationId: { type: String, default: "", maxlength: 200 },
  approvedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true, collection: "automation_action_runs", minimize: false });

schema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ workspaceId: 1, createdAt: -1 });
schema.index({ workspaceId: 1, actionType: 1, createdAt: -1 });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("AutomationActionRun", schema);
