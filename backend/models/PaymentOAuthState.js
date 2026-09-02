const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  provider: { type: String, enum: ["square"], required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  nonceHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, collection: "payment_oauth_states" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("PaymentOAuthState", schema);
