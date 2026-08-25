const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  roleKey: { type: String, enum: ["coach", "ambassador", "closer", "general"], required: true },
  subject: { type: String, required: true, trim: true, maxlength: 300 },
  body: { type: String, required: true, maxlength: 10000 },
  version: { type: Number, default: 1, min: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "invitation_templates" });
schema.index({ workspaceId: 1, roleKey: 1 }, { unique: true }); schema.plugin(workspacePlugin);
module.exports = mongoose.model("InvitationTemplate", schema);
