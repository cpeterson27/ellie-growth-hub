const mongoose = require("mongoose");

const workspaceMembershipSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "admin", "member", "viewer"], default: "member" },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  },
  { timestamps: true },
);

workspaceMembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("WorkspaceMembership", workspaceMembershipSchema);
