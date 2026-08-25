const mongoose = require("mongoose");

const workspaceMembershipSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "admin", "coach", "closer", "ambassador", "member", "viewer"], default: "member" },
    roles: { type: [{ type: String, enum: ["owner", "admin", "coach", "closer", "ambassador", "member", "viewer"] }], default: [] },
    permissionOverrides: {
      allow: { type: [String], default: [] },
      deny: { type: [String], default: [] },
    },
    responsibilities: {
      programIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram" }], default: [] },
      applicationProgramIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram" }], default: [] },
      salesPipelineIds: { type: [String], default: [] },
    },
    status: { type: String, enum: ["invited", "active", "suspended"], default: "active", index: true },
  },
  { timestamps: true },
);

workspaceMembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("WorkspaceMembership", workspaceMembershipSchema);
