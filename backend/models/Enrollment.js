const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const enrollmentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  coachingProgramId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram", required: true, index: true },
  sourceOpportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOpportunity", default: null, index: true },
  status: { type: String, enum: ["pending", "active", "paused", "completed", "cancelled"], default: "pending", index: true },
  startsAt: { type: Date, required: true, index: true },
  expectedEndAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  currentStageKey: { type: String, default: "", trim: true, lowercase: true, maxlength: 80, index: true },
  programVersion: { type: Number, required: true, min: 1 },
  programSnapshot: {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    duration: { type: mongoose.Schema.Types.Mixed, default: {} },
    defaultPrice: { type: mongoose.Schema.Types.Mixed, default: {} },
    stages: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  externalRefs: {
    skoolMemberId: { type: String, default: "", trim: true, maxlength: 255 },
    skoolProgramId: { type: String, default: "", trim: true, maxlength: 255 },
    skoolGroupId: { type: String, default: "", trim: true, maxlength: 255 },
    skoolStatus: { type: String, enum: ["", "not_invited", "invited", "access_pending", "active", "revoked", "sync_error"], default: "" },
    skoolJoinedAt: { type: Date, default: null },
    skoolInvitedAt: { type: Date, default: null },
    skoolLastSyncedAt: { type: Date, default: null },
    skoolSource: { type: String, enum: ["", "manual", "zapier", "skool_paid_member"], default: "" },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "coaching_enrollments" });

enrollmentSchema.index({ workspaceId: 1, contactId: 1, createdAt: -1 });
enrollmentSchema.index({ workspaceId: 1, coachingProgramId: 1, status: 1 });
enrollmentSchema.plugin(workspacePlugin);

module.exports = mongoose.model("Enrollment", enrollmentSchema);
