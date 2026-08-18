const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const crmActivitySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null, index: true },
  type: {
    type: String,
    enum: ["note", "call", "meeting", "task", "status_change", "email", "campaign", "research", "system"],
    required: true,
    index: true,
  },
  direction: { type: String, enum: ["", "inbound", "outbound"], default: "" },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  body: { type: String, default: "", trim: true, maxlength: 5000 },
  occurredAt: { type: Date, required: true, default: Date.now, index: true },
  dueAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  source: { type: String, enum: ["manual", "crm", "campaign", "email", "integration", "research"], default: "manual" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "crm_activities" });

crmActivitySchema.index({ workspaceId: 1, contactId: 1, occurredAt: -1 });
crmActivitySchema.index({ workspaceId: 1, organizationId: 1, occurredAt: -1 });
crmActivitySchema.plugin(workspacePlugin);

module.exports = mongoose.model("CrmActivity", crmActivitySchema);
