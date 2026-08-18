const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const communicationConsentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
  channel: { type: String, enum: ["sms", "mms", "voice"], required: true, index: true },
  address: { type: String, required: true, trim: true, index: true },
  purpose: { type: String, enum: ["transactional", "marketing", "all"], default: "all" },
  status: { type: String, enum: ["unknown", "opted_in", "opted_out"], default: "unknown", index: true },
  source: { type: String, enum: ["web_form", "paper", "verbal", "keyword", "import", "provider", "manual"], default: "manual" },
  proof: { type: String, default: "", maxlength: 5000 },
  keyword: { type: String, default: "", maxlength: 80 },
  consentedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "communication_consents" });

communicationConsentSchema.index({ workspaceId: 1, channel: 1, address: 1, purpose: 1 }, { unique: true });
communicationConsentSchema.plugin(workspacePlugin);
module.exports = mongoose.model("CommunicationConsent", communicationConsentSchema);
