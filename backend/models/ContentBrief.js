const mongoose = require("mongoose");

const contentBriefSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ["email", "email_template", "social", "landing_page", "ad", "brief"], default: "brief" },
  body: { type: String, required: true },
  subject: { type: String, default: "" },
  callToAction: { type: String, default: "" },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  source: { type: String, enum: ["manual", "jarvis"], default: "manual" },
  status: { type: String, enum: ["draft", "approved", "archived"], default: "draft" },
}, { timestamps: true, collection: "content_briefs" });

module.exports = mongoose.model("ContentBrief", contentBriefSchema);
