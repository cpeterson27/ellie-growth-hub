const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  provider: { type: String, enum: ["instagram", "facebook"], required: true, index: true },
  assetId: { type: String, required: true, trim: true },
  contentId: { type: String, default: "", trim: true },
  contentBriefId: { type: mongoose.Schema.Types.ObjectId, ref: "ContentBrief", default: null },
  triggerType: { type: String, enum: ["comment_any", "comment_keyword", "dm_keyword", "dm_any", "story_reply", "mention", "postback", "referral"], required: true, index: true },
  keywords: { type: [String], default: [] },
  responseTemplate: { type: String, default: "", maxlength: 2000 },
  cta: { label: { type: String, default: "" }, destination: { type: String, default: "" } },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null, index: true },
  tags: { type: [String], default: [] },
  qualification: { type: [String], default: [] },
  enabled: { type: Boolean, default: false, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, collection: "social_automations" });

schema.index({ workspaceId: 1, provider: 1, assetId: 1, contentId: 1, enabled: 1 });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("SocialAutomation", schema);
