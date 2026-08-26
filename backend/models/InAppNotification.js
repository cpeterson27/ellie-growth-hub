const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const inAppNotificationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  monitorId: { type: mongoose.Schema.Types.ObjectId, ref: "ResearchMonitor", default: null },
  signalId: { type: mongoose.Schema.Types.ObjectId, ref: "IntentSignal", default: null },
  type: { type: String, enum: ["high_scoring_lead", "published_email", "monitor_complete", "source_failure", "qualified_lead", "privacy_request", "ambassador_profile_complete", "ambassador_welcome_ready", "ambassador_reminder"], required: true },
  privacyRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "PrivacyRequest", default: null, index: true },
  actionUrl: { type: String, default: "", maxlength: 500 },
  title: { type: String, required: true },
  message: { type: String, required: true },
  readAt: { type: Date, default: null },
}, { timestamps: true });

inAppNotificationSchema.index({ workspaceId: 1, readAt: 1, createdAt: -1 });
inAppNotificationSchema.plugin(workspacePlugin);
module.exports = mongoose.model("InAppNotification", inAppNotificationSchema);
