const mongoose = require("mongoose");
const workspacePlugin = require("../tenancy/workspacePlugin");

const jarvisProfileSchema = new mongoose.Schema({
  key: { type: String, required: true, default: "default" },
  name: { type: String, default: "Jarvis", trim: true, maxlength: 40 },
  greeting: { type: String, default: "Your workspace assistant for lead research, campaign planning, and follow-through.", trim: true, maxlength: 240 },
  voiceName: { type: String, default: "marin", trim: true, maxlength: 160 },
  voiceRate: { type: Number, default: 1, min: 0.5, max: 2 },
  voicePitch: { type: Number, default: 1, min: 0, max: 2 },
  autoSpeak: { type: Boolean, default: true },
  theme: { type: String, enum: ["executive", "midnight", "copper"], default: "executive" },
  responseStyle: { type: String, enum: ["concise", "collaborative", "detailed"], default: "collaborative" },
}, { timestamps: true, collection: "jarvis_profiles" });

jarvisProfileSchema.plugin(workspacePlugin);
jarvisProfileSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model("JarvisProfile", jarvisProfileSchema);
