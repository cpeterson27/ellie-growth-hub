const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  widgetId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatWidget", required: true, index: true },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationThread", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  name: { type: String, default: "", maxlength: 160 },
  email: { type: String, default: "", lowercase: true, trim: true },
  phone: { type: String, default: "", trim: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  lastSeenAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "chat_visitor_sessions" });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("ChatVisitorSession", schema);
