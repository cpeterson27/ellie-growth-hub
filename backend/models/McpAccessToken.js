const mongoose = require("mongoose");

const mcpAccessTokenSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  tokenHash: { type: String, required: true, unique: true, select: false },
  prefix: { type: String, required: true },
  scopes: { type: [String], default: ["research:read", "research:write", "crm:read", "crm:write", "campaigns:read", "campaigns:write", "imports:write", "settings:write"] },
  lastUsedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("McpAccessToken", mcpAccessTokenSchema);
