const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const coachingNoteSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
  coachAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachAssignment", default: null, index: true },
  authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  authorCoachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", default: null, index: true },
  category: { type: String, enum: ["general", "progress", "concern", "action_item", "handoff"], default: "general", index: true },
  body: { type: String, required: true, trim: true, maxlength: 10000 },
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "coaching_notes" });

coachingNoteSchema.index({ workspaceId: 1, enrollmentId: 1, createdAt: -1 });
coachingNoteSchema.index({ workspaceId: 1, contactId: 1, createdAt: -1 });
coachingNoteSchema.plugin(workspacePlugin);

module.exports = mongoose.model("CoachingNote", coachingNoteSchema);
