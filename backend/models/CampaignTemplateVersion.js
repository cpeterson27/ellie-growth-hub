const mongoose = require("mongoose");

const campaignTemplateVersionSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    version: { type: Number, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 30000 },
    callToAction: { type: String, default: "", trim: true, maxlength: 120 },
    callToActionUrl: { type: String, default: "", trim: true, maxlength: 1000 },
    topic: {
      type: String,
      enum: ["event_invitations", "program_offers", "educational_newsletter"],
      required: true,
    },
    approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true },
);

campaignTemplateVersionSchema.index({ campaignId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model("CampaignTemplateVersion", campaignTemplateVersionSchema);
