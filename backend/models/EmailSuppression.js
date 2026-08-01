const mongoose = require("mongoose");

const emailSuppressionSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  reason: { type: String, required: true, enum: ["bounce", "complaint", "provider_suppressed", "manual"] },
  provider: { type: String, default: "resend" },
  bounceType: { type: String, default: "" },
  bounceSubType: { type: String, default: "" },
  message: { type: String, default: "" },
  sourceOutreachId: { type: mongoose.Schema.Types.ObjectId, ref: "Outreach", default: null },
  suppressedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("EmailSuppression", emailSuppressionSchema);
