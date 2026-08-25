const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const coachAssignmentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  coachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", required: true, index: true },
  coachUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  stageKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 80, index: true },
  sequence: { type: Number, required: true, min: 0 },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ["scheduled", "active", "completed", "cancelled"], default: "scheduled", index: true },
  previousAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachAssignment", default: null },
  completedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "coach_assignments" });

coachAssignmentSchema.index({ workspaceId: 1, enrollmentId: 1, sequence: 1 });
coachAssignmentSchema.index({ workspaceId: 1, coachUserId: 1, status: 1, startsAt: 1, endsAt: 1 });
coachAssignmentSchema.index({ workspaceId: 1, contactId: 1, status: 1 });
coachAssignmentSchema.index(
  { workspaceId: 1, previousAssignmentId: 1 },
  { unique: true, partialFilterExpression: { previousAssignmentId: { $type: "objectId" } } },
);
coachAssignmentSchema.plugin(workspacePlugin);

module.exports = mongoose.model("CoachAssignment", coachAssignmentSchema);
