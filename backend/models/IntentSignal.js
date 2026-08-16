const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const intentSignalSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  monitorId: { type: mongoose.Schema.Types.ObjectId, ref: "ResearchMonitor", required: true, index: true },
  source: { type: String, required: true, trim: true, index: true },
  sourceId: { type: String, required: true, trim: true },
  sourceUrl: { type: String, required: true, trim: true },
  title: { type: String, default: "", trim: true, maxlength: 1000 },
  excerpt: { type: String, default: "", trim: true, maxlength: 6000 },
  authorName: { type: String, default: "", trim: true },
  authorUrl: { type: String, default: "", trim: true },
  organizationName: { type: String, default: "", trim: true },
  organizationDomain: { type: String, default: "", trim: true },
  publishedEmails: [{ type: String, lowercase: true, trim: true }],
  people: [{
    name: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    evidenceUrl: { type: String, default: "", trim: true },
  }],
  websiteResearchStatus: { type: String, enum: ["not_applicable", "pending", "completed", "blocked", "failed"], default: "not_applicable" },
  publishedAt: { type: Date, default: null },
  discoveredAt: { type: Date, default: Date.now },
  matchedKeywords: [{ type: String, trim: true }],
  score: { type: Number, default: 0, min: 0, max: 100, index: true },
  scoreReasons: [{ type: String, trim: true }],
  classification: { type: String, enum: ["buyer_intent", "hypothetical_or_student", "promotion", "job_seeker", "irrelevant", "uncertain"], default: "uncertain", index: true },
  classificationMethod: { type: String, enum: ["rules", "openai"], default: "rules" },
  classificationReason: { type: String, default: "", trim: true },
  audienceEligible: { type: Boolean, default: true, index: true },
  audienceRejectionReason: { type: String, default: "", trim: true },
  identityResolution: {
    status: { type: String, enum: ["unresolved", "supported", "conflicting"], default: "unresolved" },
    reason: { type: String, default: "" },
    evidenceUrls: [{ type: String, trim: true }],
  },
  status: { type: String, enum: ["new", "reviewing", "qualified", "dismissed", "converted"], default: "new", index: true },
  evidence: [{
    label: { type: String, default: "Public source" },
    url: { type: String, required: true },
    observedAt: { type: Date, default: Date.now },
  }],
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

intentSignalSchema.index({ workspaceId: 1, source: 1, sourceId: 1 }, { unique: true });
intentSignalSchema.index({ workspaceId: 1, status: 1, score: -1, publishedAt: -1 });

intentSignalSchema.plugin(workspacePlugin);
module.exports = mongoose.model("IntentSignal", intentSignalSchema);
