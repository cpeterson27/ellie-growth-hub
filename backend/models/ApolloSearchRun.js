const mongoose = require("mongoose");

const apolloSearchRunSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  mode: { type: String, enum: ["people", "organizations"], required: true },
  templateName: { type: String, default: "", maxlength: 120 },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ["success", "empty", "error"], required: true },
  totalMatches: { type: Number, default: 0 },
  resultsReturned: { type: Number, default: 0 },
  importedCount: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  errorCode: { type: String, default: "" },
  errorMessage: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("ApolloSearchRun", apolloSearchRunSchema);
