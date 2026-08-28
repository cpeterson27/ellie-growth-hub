const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true, maxlength: 24000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, default: "New Jarvis conversation", trim: true, maxlength: 120 },
  messages: { type: [messageSchema], default: [] },
  archived: { type: Boolean, default: false, index: true },
  lastActivityAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true, collection: "jarvis_conversations" });

schema.plugin(workspacePlugin);
schema.index({ workspaceId: 1, userId: 1, lastActivityAt: -1 });
module.exports = mongoose.model("JarvisConversation", schema);
