const mongoose = require("mongoose");

const researchMonitorSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  query: { type: String, required: true, trim: true, maxlength: 1200 },
  keywords: [{ type: String, trim: true }],
  negativeKeywords: [{ type: String, trim: true }],
  locations: [{ type: String, trim: true }],
  sources: [{ type: String, enum: ["bing_web", "bing_news", "gdelt", "sec_form_d", "bluesky", "hacker_news", "stack_exchange", "discourse", "rss", "reddit_rss", "duckduckgo"] }],
  feedUrls: [{ type: String, trim: true }],
  enabled: { type: Boolean, default: true, index: true },
  intervalMinutes: { type: Number, default: 60, min: 15, max: 10080 },
  maxResultsPerSource: { type: Number, default: 25, min: 5, max: 100 },
  lastRunAt: { type: Date, default: null },
  nextRunAt: { type: Date, default: Date.now, index: true },
  lastRunStatus: { type: String, enum: ["never", "running", "completed", "partial", "failed"], default: "never" },
  lastRunMessage: { type: String, default: "" },
  totals: {
    runs: { type: Number, default: 0 },
    signalsFound: { type: Number, default: 0 },
    signalsQualified: { type: Number, default: 0 },
  },
}, { timestamps: true });

researchMonitorSchema.index({ workspaceId: 1, enabled: 1, nextRunAt: 1 });

module.exports = mongoose.model("ResearchMonitor", researchMonitorSchema);
