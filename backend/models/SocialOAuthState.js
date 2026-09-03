const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  provider: { type: String, required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  nonceHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ workspaceId: 1, userId: 1, provider: 1, expiresAt: 1 });

module.exports = mongoose.model("SocialOAuthState", schema);
