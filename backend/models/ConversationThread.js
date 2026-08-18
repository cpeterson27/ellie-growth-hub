const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const attachmentSchema = new mongoose.Schema({
  name: { type: String, default: "", trim: true },
  contentType: { type: String, default: "", trim: true },
  size: { type: Number, default: 0, min: 0 },
  url: { type: String, default: "", trim: true },
  providerId: { type: String, default: "", trim: true },
}, { _id: false });

const participantSchema = new mongoose.Schema({
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  kind: { type: String, enum: ["contact", "user", "external"], default: "external" },
  role: { type: String, enum: ["from", "to", "cc", "bcc", "participant"], default: "participant" },
  name: { type: String, default: "", trim: true },
  address: { type: String, default: "", trim: true, lowercase: true },
}, { _id: false });

const conversationThreadSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  channel: { type: String, enum: ["email", "sms", "mms", "phone", "chat", "whatsapp", "facebook", "instagram", "linkedin", "manual"], required: true, index: true },
  provider: { type: String, default: "", trim: true, lowercase: true },
  providerThreadId: { type: String, default: "", trim: true },
  mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationMailbox", default: null, index: true },
  subject: { type: String, default: "", trim: true, maxlength: 500 },
  preview: { type: String, default: "", trim: true, maxlength: 1000 },
  participants: { type: [participantSchema], default: [] },
  contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact", index: true }],
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOpportunity", default: null, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  status: { type: String, enum: ["open", "pending", "snoozed", "closed", "spam"], default: "open", index: true },
  priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal", index: true },
  unreadCount: { type: Number, default: 0, min: 0 },
  tags: { type: [String], default: [] },
  lastMessageAt: { type: Date, default: null, index: true },
  lastInboundAt: { type: Date, default: null },
  lastOutboundAt: { type: Date, default: null },
  snoozedUntil: { type: Date, default: null },
  sla: {
    firstResponseDueAt: { type: Date, default: null },
    nextResponseDueAt: { type: Date, default: null },
    breachedAt: { type: Date, default: null },
  },
  draft: {
    subject: { type: String, default: "", maxlength: 500 },
    body: { type: String, default: "", maxlength: 50000 },
    attachments: { type: [attachmentSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: null },
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "conversation_threads" });

conversationThreadSchema.index({ workspaceId: 1, status: 1, lastMessageAt: -1 });
conversationThreadSchema.index({ workspaceId: 1, assignedTo: 1, status: 1 });
conversationThreadSchema.index(
  { workspaceId: 1, provider: 1, providerThreadId: 1 },
  { unique: true, partialFilterExpression: { providerThreadId: { $type: "string", $gt: "" } } },
);
conversationThreadSchema.plugin(workspacePlugin);

module.exports = mongoose.model("ConversationThread", conversationThreadSchema);
