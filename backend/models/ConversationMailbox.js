const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const conversationMailboxSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  provider: { type: String, enum: ["gmail", "microsoft", "imap", "website_chat", "whatsapp", "facebook", "instagram", "linkedin_manual"], required: true, index: true },
  providerAccountId: { type: String, default: "", trim: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  address: { type: String, required: true, trim: true, lowercase: true },
  status: { type: String, enum: ["connected", "paused", "disconnected"], default: "connected", index: true },
  shared: { type: Boolean, default: true },
  assignmentMode: { type: String, enum: ["manual", "round_robin", "owner"], default: "manual" },
  defaultAssignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  signature: {
    name: { type: String, default: "" },
    text: { type: String, default: "", maxlength: 10000 },
    html: { type: String, default: "", maxlength: 50000 },
  },
  trackingPreferences: {
    opens: { type: Boolean, default: false },
    clicks: { type: Boolean, default: false },
  },
  templates: [{
    name: { type: String, required: true, trim: true, maxlength: 120 },
    subject: { type: String, default: "", maxlength: 500 },
    body: { type: String, required: true, maxlength: 50000 },
  }],
  lastSyncedAt: { type: Date, default: null },
  lastSyncError: { type: String, default: "" },
}, { timestamps: true, collection: "conversation_mailboxes" });

conversationMailboxSchema.index({ workspaceId: 1, provider: 1, address: 1 }, { unique: true });
conversationMailboxSchema.plugin(workspacePlugin);

module.exports = mongoose.model("ConversationMailbox", conversationMailboxSchema);
