const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const coachingHandoffSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
  fromAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachAssignment", required: true, index: true },
  fromCoachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", required: true, index: true },
  fromCoachUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  fromStageKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  toAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachAssignment", default: null, index: true },
  toCoachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", default: null, index: true },
  toStageKey: { type: String, default: "", trim: true, lowercase: true, maxlength: 80 },
  summary: { type: String, required: true, trim: true, maxlength: 10000 },
  progress: { type: String, default: "", trim: true, maxlength: 10000 },
  observations: { type: String, default: "", trim: true, maxlength: 10000 },
  actionItems: { type: String, default: "", trim: true, maxlength: 10000 },
  status: { type: String, enum: ["draft", "submitted", "completed"], default: "draft", index: true },
  submittedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "coaching_handoffs" });

coachingHandoffSchema.index({ workspaceId: 1, fromAssignmentId: 1 }, { unique: true });
coachingHandoffSchema.index({ workspaceId: 1, enrollmentId: 1, createdAt: -1 });
coachingHandoffSchema.plugin(workspacePlugin);

module.exports = mongoose.model("CoachingHandoff", coachingHandoffSchema);
