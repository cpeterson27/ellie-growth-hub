const mongoose = require("mongoose");

const contactImportReceiptSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  importBatchId: { type: String, required: true, maxlength: 100 },
  importFileName: { type: String, default: "", maxlength: 200 },
  summary: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

contactImportReceiptSchema.index({ workspaceId: 1, createdAt: -1 });
contactImportReceiptSchema.index({ workspaceId: 1, importBatchId: 1 }, { unique: true });

module.exports = mongoose.model("ContactImportReceipt", contactImportReceiptSchema);
