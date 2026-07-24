const JarvisProfile = require("../models/JarvisProfile");

const ALLOWED_FIELDS = ["name", "greeting", "voiceName", "voiceRate", "voicePitch", "autoSpeak", "theme", "responseStyle"];

async function getProfile() {
  return JarvisProfile.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

async function updateProfile(input = {}) {
  const update = {};
  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) update[field] = input[field];
  }
  return JarvisProfile.findOneAndUpdate(
    { key: "default" },
    { $set: update, $setOnInsert: { key: "default" } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
}

module.exports = { getProfile, updateProfile };
