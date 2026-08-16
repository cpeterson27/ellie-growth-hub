const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const previewPersonSchema = new mongoose.Schema({
  firstName: { type: String, default: "", trim: true },
  lastName: { type: String, default: "", trim: true },
  title: { type: String, default: "", trim: true },
  company: { type: String, default: "", trim: true },
  companyWebsite: { type: String, default: "", trim: true },
  email: { type: String, default: "", trim: true, lowercase: true },
  emailStatus: { type: String, enum: ["missing", "published_unverified"], default: "missing" },
  evidenceUrl: { type: String, required: true, trim: true },
  evidenceSummary: { type: String, default: "", trim: true },
  evidenceObservedAt: { type: Date, default: Date.now },
  reviewStatus: { type: String, enum: ["new", "existing", "file_duplicate"], default: "new" },
  matchReason: { type: String, default: "", trim: true },
  existingContactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },
}, { _id: false });

const peopleResearchPreviewSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  fingerprint: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  source: { type: String, enum: ["jarvis_public_web", "chatgpt_public_web"], default: "jarvis_public_web" },
  status: { type: String, enum: ["staged", "approval_pending", "imported"], default: "staged", index: true },
  people: { type: [previewPersonSchema], default: [] },
  summary: {
    total: { type: Number, default: 0 },
    newContacts: { type: Number, default: 0 },
    existingContacts: { type: Number, default: 0 },
    duplicatesInFile: { type: Number, default: 0 },
    publishedEmails: { type: Number, default: 0 },
  },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowthActionApproval", default: null },
  importedAt: { type: Date, default: null },
  importResult: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

peopleResearchPreviewSchema.index({ workspaceId: 1, fingerprint: 1 }, { unique: true });
peopleResearchPreviewSchema.index({ workspaceId: 1, updatedAt: -1 });

peopleResearchPreviewSchema.plugin(workspacePlugin);
module.exports = mongoose.model("PeopleResearchPreview", peopleResearchPreviewSchema);
