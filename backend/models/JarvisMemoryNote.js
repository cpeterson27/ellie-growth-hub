const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const jarvisMemoryNoteSchema = new mongoose.Schema({
  source: { type: String, enum: ["obsidian_bridge"], required: true, default: "obsidian_bridge", index: true },
  path: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  contentHash: { type: String, required: true },
  sourceUpdatedAt: { type: Date, default: null },
}, { timestamps: true, collection: "jarvis_memory_notes" });

jarvisMemoryNoteSchema.index({ workspaceId: 1, source: 1, path: 1 }, { unique: true });
jarvisMemoryNoteSchema.plugin(workspacePlugin);

module.exports = mongoose.model("JarvisMemoryNote", jarvisMemoryNoteSchema);
