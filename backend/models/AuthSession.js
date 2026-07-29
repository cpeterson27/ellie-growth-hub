const mongoose = require("mongoose");

const authSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true, select: false },
    csrfToken: { type: String, required: true, select: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    lastSeenAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AuthSession", authSessionSchema);
