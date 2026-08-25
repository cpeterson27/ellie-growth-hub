const mongoose = require("mongoose"); const workspacePlugin = require("../tenancy/workspacePlugin");
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  scope: { type: String, enum: ["default", "coach", "program", "product"], required: true, index: true },
  coachProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachProfile", default: null, index: true },
  coachingProgramId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingProgram", default: null, index: true },
  productKey: { type: String, default: "", trim: true, lowercase: true, maxlength: 120, index: true },
  label: { type: String, required: true, trim: true, maxlength: 180 }, rateBps: { type: Number, required: true, min: 0, max: 10000 },
  active: { type: Boolean, default: true, index: true }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "commission_rules" });
schema.index({ workspaceId: 1, scope: 1, coachProfileId: 1, coachingProgramId: 1, productKey: 1 }, { unique: true }); schema.plugin(workspacePlugin);
module.exports = mongoose.model("CommissionRule", schema);
