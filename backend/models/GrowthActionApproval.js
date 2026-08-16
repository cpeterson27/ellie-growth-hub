const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const growthActionApprovalSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  action: { type: String, enum: ["send_campaign", "archive_contacts", "apply_template", "add_crm_field", "import_linkedin_connections", "import_public_people", "update_contact_field"], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
  confirmationPhrase: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

growthActionApprovalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

growthActionApprovalSchema.plugin(workspacePlugin);
module.exports = mongoose.model("GrowthActionApproval", growthActionApprovalSchema);
