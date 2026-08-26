const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  key: { type: String, enum: ["ambassador_welcome"], default: "ambassador_welcome" },
  name: { type: String, default: "Welcome Ambassador", maxlength: 160 },
  headline: { type: String, default: "WELCOME TO THE TEAM", maxlength: 180 },
  subheadline: { type: String, default: "{{ambassadorName}}", maxlength: 300 },
  bodyText: { type: String, default: "Brand Ambassador · {{workspaceName}}", maxlength: 500 },
  cta: { type: String, default: "Learn. Operate. Grow.", maxlength: 240 },
  logoUrl: { type: String, default: "", maxlength: 2000 },
  layout: { type: String, enum: ["photo_left", "photo_right", "photo_center"], default: "photo_left" },
  colors: { background: { type: String, default: "#101411" }, accent: { type: String, default: "#79d23b" }, text: { type: String, default: "#ffffff" } },
  elements: { logo: { type: Boolean, default: true }, headline: { type: Boolean, default: true }, subheadline: { type: Boolean, default: true }, body: { type: Boolean, default: true }, cta: { type: Boolean, default: true } },
  captionInstructions: { type: String, default: "Warmly welcome the ambassador, introduce their role, and invite the audience to say hello. Do not invent achievements.", maxlength: 4000 },
  defaultPlatforms: { type: [String], enum: ["instagram", "facebook", "linkedin", "x"], default: ["instagram", "facebook"] },
  version: { type: Number, default: 1 }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "social_graphic_templates" });
schema.index({ workspaceId: 1, key: 1 }, { unique: true }); schema.plugin(workspacePlugin); module.exports = mongoose.model("SocialGraphicTemplate", schema);
