const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const zoomWebhookEventSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  providerEventId: { type: String, required: true, trim: true, maxlength: 255 },
  eventType: { type: String, required: true, trim: true, maxlength: 160, index: true },
  coachingSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "CoachingSession", required: true, index: true },
  receivedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: "zoom_webhook_events" });

zoomWebhookEventSchema.index({ workspaceId: 1, providerEventId: 1 }, { unique: true });
zoomWebhookEventSchema.plugin(workspacePlugin);

module.exports = mongoose.model("ZoomWebhookEvent", zoomWebhookEventSchema);
