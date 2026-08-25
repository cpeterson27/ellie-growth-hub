const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const coachProfileSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  displayName: { type: String, default: "", trim: true, maxlength: 160 },
  status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
  timezone: { type: String, default: "", trim: true, maxlength: 100 },
  capacity: { type: Number, default: null, min: 0 },
  referralCode: { type: String, default: "", trim: true, lowercase: true, maxlength: 80 },
  referralSlug: { type: String, default: "", trim: true, lowercase: true, maxlength: 80 },
  deactivatedAt: { type: Date, default: null },
}, { timestamps: true, collection: "coach_profiles" });

coachProfileSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
coachProfileSchema.index({ workspaceId: 1, referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $gt: "" } } });
coachProfileSchema.index({ workspaceId: 1, referralSlug: 1 }, { unique: true, partialFilterExpression: { referralSlug: { $gt: "" } } });
coachProfileSchema.index({ workspaceId: 1, status: 1, displayName: 1 });
coachProfileSchema.plugin(workspacePlugin);

module.exports = mongoose.model("CoachProfile", coachProfileSchema);
