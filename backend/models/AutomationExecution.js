const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const stepSchema = new mongoose.Schema({ actionIndex: Number, actionType: String, status: { type: String, enum: ["waiting", "processing", "completed", "skipped", "blocked", "failed"], required: true }, idempotencyKey: String, startedAt: Date, completedAt: Date, attempts: { type: Number, default: 0 }, reason: { type: String, default: "", maxlength: 2000 }, result: { type: mongoose.Schema.Types.Mixed, default: {} } }, { _id: false });
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true }, automationId: { type: mongoose.Schema.Types.ObjectId, ref: "Automation", required: true, index: true },
  triggerActivityId: { type: mongoose.Schema.Types.ObjectId, ref: "CrmActivity", required: true, index: true }, triggerEventType: { type: String, required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true }, enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null }, opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOpportunity", default: null }, coachingSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingSession", default: null }, coachAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachAssignment", default: null },
  status: { type: String, enum: ["pending", "waiting", "processing", "completed", "skipped", "blocked", "failed", "cancelled"], default: "pending", index: true },
  nextActionIndex: { type: Number, default: 0 }, waitingActionIndex: { type: Number, default: null }, runAt: { type: Date, default: Date.now, index: true }, attempts: { type: Number, default: 0 }, maxAttempts: { type: Number, default: 3 },
  steps: { type: [stepSchema], default: [] }, contextSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} }, lastError: { type: String, default: "", maxlength: 2000 }, startedAt: { type: Date, default: null }, completedAt: { type: Date, default: null }, cancelledAt: { type: Date, default: null },
}, { timestamps: true, collection: "automation_executions" });
schema.index({ workspaceId: 1, automationId: 1, triggerActivityId: 1 }, { unique: true });
schema.index({ status: 1, runAt: 1 });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("AutomationExecution", schema);
