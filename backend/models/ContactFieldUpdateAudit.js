const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const contactFieldUpdateAuditSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowthActionApproval", required: true, index: true },
  source: { type: String, enum: ["jarvis", "gpt_action"], required: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  contactName: { type: String, default: "" },
  fieldKey: { type: String, required: true },
  fieldLabel: { type: String, required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

contactFieldUpdateAuditSchema.index({ workspaceId: 1, createdAt: -1 });

contactFieldUpdateAuditSchema.plugin(workspacePlugin);
module.exports = mongoose.model("ContactFieldUpdateAudit", contactFieldUpdateAuditSchema);
