const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const socialConnectionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  provider: { type: String, enum: ["linkedin", "meta"], required: true },
  status: { type: String, enum: ["connected", "expired", "failed", "disconnected"], default: "connected", index: true },
  credentialsEncrypted: { type: mongoose.Schema.Types.Mixed, required: false, select: false },
  scopes: { type: [String], default: [] },
  expiresAt: { type: Date, default: null },
  providerAccount: {
    id: { type: String, default: "" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
  },
  assets: [{
    id: { type: String, required: true },
    name: { type: String, default: "" },
    type: { type: String, enum: ["linkedin_organization", "facebook_page", "instagram_business"], required: true },
    parentId: { type: String, default: "" },
    username: { type: String, default: "" },
    permissions: { type: [String], default: [] },
  }],
  selectedAssetIds: { type: [String], default: [] },
  connectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  connectedAt: { type: Date, default: Date.now },
  lastVerifiedAt: { type: Date, default: null },
  lastError: { type: String, default: "" },
}, { timestamps: true });

socialConnectionSchema.index({ workspaceId: 1, provider: 1 }, { unique: true });

socialConnectionSchema.plugin(workspacePlugin);
module.exports = mongoose.model("SocialConnection", socialConnectionSchema);
