const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const monitorActivitySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  monitorId: { type: mongoose.Schema.Types.ObjectId, ref: "ResearchMonitor", required: true, index: true },
  runId: { type: String, required: true, index: true },
  type: { type: String, enum: ["run_started", "sources_checked", "candidates_collected", "weak_matches_rejected", "websites_researched", "leads_prepared", "source_failure", "run_completed"], required: true },
  message: { type: String, required: true },
  count: { type: Number, default: 0 },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

monitorActivitySchema.index({ workspaceId: 1, createdAt: -1 });
monitorActivitySchema.plugin(workspacePlugin);
module.exports = mongoose.model("MonitorActivity", monitorActivitySchema);
