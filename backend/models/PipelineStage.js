const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const pipelineStageSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  key: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
  label: { type: String, required: true, trim: true, maxlength: 80 },
  order: { type: Number, required: true, min: 0 },
  probability: { type: Number, default: 0, min: 0, max: 100 },
  color: { type: String, default: "neutral", enum: ["neutral", "info", "warning", "success", "danger"] },
  terminal: { type: String, default: "", enum: ["", "won", "lost"] },
  active: { type: Boolean, default: true },
}, { timestamps: true, collection: "pipeline_stages" });

pipelineStageSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
pipelineStageSchema.index({ workspaceId: 1, order: 1 });
pipelineStageSchema.plugin(workspacePlugin);
module.exports = mongoose.model("PipelineStage", pipelineStageSchema);
