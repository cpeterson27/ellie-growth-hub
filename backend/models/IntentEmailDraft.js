const mongoose = require("mongoose");

const intentEmailDraftSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  signalId: { type: mongoose.Schema.Types.ObjectId, ref: "IntentSignal", required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
  subject: { type: String, required: true, trim: true, maxlength: 300 },
  body: { type: String, required: true, maxlength: 30000 },
  eventbriteUrl: { type: String, required: true, trim: true },
  meetupUrl: { type: String, required: true, trim: true },
  personalizationBasis: { type: String, default: "", maxlength: 2000 },
  generationMethod: { type: String, enum: ["rules", "openai"], default: "rules" },
  templateAudienceKey: { type: String, default: "", trim: true },
  templateAudienceLabel: { type: String, default: "", trim: true },
  templateVersion: { type: Number, default: 0 },
  status: { type: String, enum: ["draft", "reviewed", "transferred"], default: "draft", index: true },
  reviewedAt: { type: Date, default: null },
  outreachId: { type: mongoose.Schema.Types.ObjectId, ref: "Outreach", default: null },
}, { timestamps: true });

intentEmailDraftSchema.index({ workspaceId: 1, signalId: 1, campaignId: 1 }, { unique: true });
module.exports = mongoose.model("IntentEmailDraft", intentEmailDraftSchema);
