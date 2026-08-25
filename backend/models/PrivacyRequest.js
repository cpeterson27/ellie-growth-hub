const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  source: { type: String, enum: ["gmail", "manual"], default: "gmail" },
  providerThreadId: { type: String, default: "", trim: true },
  providerMessageId: { type: String, default: "", trim: true },
  status: { type: String, enum: ["received", "under_review", "verified", "completed", "rejected"], default: "received", index: true },
  requester: {
    name: { type: String, default: "", maxlength: 180 },
    email: { type: String, default: "", lowercase: true, trim: true, maxlength: 320 },
    emailHash: { type: String, default: "" },
    metaIdentifiers: { type: [String], default: [] },
  },
  requestText: { type: String, default: "", maxlength: 10000 },
  verificationNotes: { type: String, default: "", maxlength: 3000 },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  verifiedAt: { type: Date, default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  completedAt: { type: Date, default: null },
  selectedContactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
  completedCategories: { type: [String], default: [] },
  resultCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
  auditTrail: [{
    _id: false, action: String, actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now }, detail: { type: String, default: "", maxlength: 500 },
  }],
}, { timestamps: true, collection: "privacy_requests" });

schema.index({ workspaceId: 1, source: 1, providerMessageId: 1 }, { unique: true, partialFilterExpression: { providerMessageId: { $type: "string", $gt: "" } } });
schema.index({ workspaceId: 1, status: 1, createdAt: -1 });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("PrivacyRequest", schema);
