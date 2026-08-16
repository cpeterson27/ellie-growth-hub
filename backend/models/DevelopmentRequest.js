const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const developmentRequestSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  originalRequest: { type: String, required: true, trim: true, maxlength: 5000 },
  requestedBy: { type: String, enum: ["jarvis", "developer"], default: "jarvis" },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  risk: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  status: {
    type: String,
    enum: ["pending_approval", "approved", "rejected", "in_progress", "completed"],
    default: "pending_approval",
    index: true,
  },
  acceptanceCriteria: { type: [String], default: [] },
  codexBrief: { type: String, default: "" },
  approvalNote: { type: String, default: "", maxlength: 2000 },
  approvedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
}, { timestamps: true, collection: "development_requests" });

developmentRequestSchema.plugin(workspacePlugin);
module.exports = mongoose.model("DevelopmentRequest", developmentRequestSchema);
