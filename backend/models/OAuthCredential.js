const mongoose = require("mongoose");

const oauthCredentialSchema = new mongoose.Schema({
  kind: { type: String, enum: ["authorization_code", "access_token", "refresh_token"], required: true, index: true },
  valueHash: { type: String, required: true, unique: true, select: false },
  clientId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  scopes: { type: [String], default: [] },
  redirectUri: { type: String, default: "" },
  codeChallenge: { type: String, default: "" },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  consumedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("OAuthCredential", oauthCredentialSchema);
