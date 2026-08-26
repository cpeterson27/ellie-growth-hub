const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");
const schema = new mongoose.Schema({
  contentBriefId: { type: mongoose.Schema.Types.ObjectId, ref: "ContentBrief", required: true },
  ambassadorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "AmbassadorProfile", required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, maxlength: 240 },
  instructions: { type: String, default: "", maxlength: 5000 },
  caption: { type: String, required: true, maxlength: 10000 },
  disclosure: { type: String, default: "", maxlength: 1000 },
  media: [{ _id: false, url: String, alt: String, type: String, publicId: String }],
  platforms: [{ type: String, enum: ["instagram", "facebook", "linkedin", "x", "tiktok"] }],
  hashtags: [String],
  referralUrl: { type: String, default: "" },
  dueAt: { type: Date, default: null },
  status: { type: String, enum: ["assigned", "viewed", "in_progress", "completed", "declined"], default: "assigned" },
  postUrl: { type: String, default: "", maxlength: 2000 },
  completedAt: { type: Date, default: null },
}, { timestamps: true });
schema.plugin(workspacePlugin);
schema.index({ workspaceId: 1, contentBriefId: 1, ambassadorProfileId: 1 }, { unique: true });
schema.index({ workspaceId: 1, ambassadorProfileId: 1, status: 1 });
module.exports = mongoose.model("AmbassadorContentTask", schema);
