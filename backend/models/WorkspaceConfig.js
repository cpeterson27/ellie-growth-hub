const mongoose = require("mongoose");

const workspaceConfigSchema = new mongoose.Schema({
  key: { type: String, default: "primary", unique: true, index: true },
  workspaceName: { type: String, default: "Ellie AI Growth Operator", trim: true, maxlength: 120 },
}, { timestamps: true });

module.exports = mongoose.model("WorkspaceConfig", workspaceConfigSchema);
