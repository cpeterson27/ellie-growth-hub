const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const marketResearchJobSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  audienceId: { type: mongoose.Schema.Types.ObjectId, ref: "Audience", default: null, index: true },
  question: { type: String, required: true, trim: true, maxlength: 1000 },
  plan: { type: mongoose.Schema.Types.Mixed, default: {} },
  sourceId: { type: String, default: "", trim: true },
  status: { type: String, enum: ["queued", "running", "completed", "failed", "source_required"], default: "queued", index: true },
  statistics: {
    received: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
  },
  error: { type: String, default: "" },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

marketResearchJobSchema.index({ workspaceId: 1, createdAt: -1 });

marketResearchJobSchema.plugin(workspacePlugin);
module.exports = mongoose.model("MarketResearchJob", marketResearchJobSchema);
