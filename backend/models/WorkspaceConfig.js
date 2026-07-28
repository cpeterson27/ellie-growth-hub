const mongoose = require("mongoose");

const workspaceConfigSchema = new mongoose.Schema({
  key: { type: String, default: "primary", unique: true, index: true },
  workspaceName: { type: String, default: "Ellie AI Growth Operator", trim: true, maxlength: 120 },
  legalBusinessName: { type: String, default: "Ellie's Coaching", trim: true, maxlength: 160 },
  postalAddress: { type: String, default: "", trim: true, maxlength: 300 },
  websiteUrl: { type: String, default: "", trim: true, maxlength: 300 },
}, { timestamps: true });

module.exports = mongoose.model("WorkspaceConfig", workspaceConfigSchema);
