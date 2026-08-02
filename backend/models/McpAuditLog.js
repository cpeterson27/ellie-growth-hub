const mongoose = require("mongoose");

const mcpAuditLogSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenId: { type: mongoose.Schema.Types.ObjectId, ref: "McpAccessToken", required: true },
  tool: { type: String, required: true, index: true },
  success: { type: Boolean, required: true },
  detail: { type: String, default: "" },
}, { timestamps: true });

mcpAuditLogSchema.index({ workspaceId: 1, createdAt: -1 });
module.exports = mongoose.model("McpAuditLog", mcpAuditLogSchema);
