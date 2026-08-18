const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationMessage", default: null, index: true },
  provider: { type: String, enum: ["twilio"], default: "twilio" },
  providerMessageId: { type: String, required: true, index: true },
  status: { type: String, required: true, index: true },
  occurredAt: { type: Date, default: Date.now },
  errorCode: { type: String, default: "" }, errorMessage: { type: String, default: "" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "message_delivery_events" });
schema.index({ workspaceId: 1, provider: 1, providerMessageId: 1, status: 1 }, { unique: true });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("MessageDeliveryEvent", schema);
