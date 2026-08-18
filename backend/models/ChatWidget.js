const crypto = require("crypto");
const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  key: { type: String, required: true, default: () => crypto.randomBytes(18).toString("base64url"), unique: true, index: true },
  name: { type: String, default: "Website chat", trim: true },
  enabled: { type: Boolean, default: true },
  allowedOrigins: { type: [String], default: [] },
  greeting: { type: String, default: "Hi! How can we help?", maxlength: 500 },
  offlineMessage: { type: String, default: "Leave a message and we’ll follow up.", maxlength: 500 },
  accentColor: { type: String, default: "#ff6b4a" },
  requireEmail: { type: Boolean, default: false },
  mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationMailbox", default: null },
}, { timestamps: true, collection: "chat_widgets" });
schema.plugin(workspacePlugin);
module.exports = mongoose.model("ChatWidget", schema);
