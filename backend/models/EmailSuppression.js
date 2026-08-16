const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const emailSuppressionSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true, lowercase: true, trim: true },
  reason: { type: String, required: true, enum: ["bounce", "complaint", "provider_suppressed", "manual"] },
  provider: { type: String, default: "resend" },
  bounceType: { type: String, default: "" },
  bounceSubType: { type: String, default: "" },
  message: { type: String, default: "" },
  sourceOutreachId: { type: mongoose.Schema.Types.ObjectId, ref: "Outreach", default: null },
  suppressedAt: { type: Date, default: Date.now },
}, { timestamps: true });

emailSuppressionSchema.plugin(workspacePlugin);
emailSuppressionSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
module.exports = mongoose.model("EmailSuppression", emailSuppressionSchema);
