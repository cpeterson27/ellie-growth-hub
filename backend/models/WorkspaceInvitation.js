const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const workspaceInvitationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  roles: { type: [String], default: [] },
  requiresAccountActivation: { type: Boolean, default: true },
  tokenHash: { type: String, required: true, select: false },
  status: { type: String, enum: ["draft", "ready", "pending", "accepted", "revoked", "expired"], default: "draft", index: true },
  deliveryStatus: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
  deliveryError: { type: String, default: "", maxlength: 500, select: false },
  expiresAt: { type: Date, required: true, index: true },
  acceptedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  roleKey: { type: String, enum: ["coach", "ambassador", "closer", "general"], default: "general" },
  templateVersion: { type: Number, default: 1 },
  subject: { type: String, default: "", maxlength: 300 },
  body: { type: String, default: "", maxlength: 10000 },
  renderedSubject: { type: String, default: "", maxlength: 300 },
  renderedBody: { type: String, default: "", maxlength: 12000 },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  deliveryHistory: { type: [{
    sentAt: { type: Date, required: true }, status: { type: String, enum: ["sent", "failed"], required: true },
    templateVersion: { type: Number, required: true }, subject: { type: String, required: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 12000 }, invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  }], default: [], select: false },
}, { timestamps: true, collection: "workspace_invitations" });

workspaceInvitationSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
workspaceInvitationSchema.plugin(workspacePlugin);

module.exports = mongoose.model("WorkspaceInvitation", workspaceInvitationSchema);
