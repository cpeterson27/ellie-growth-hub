const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["active", "disabled"], default: "active", index: true },
    lastLoginAt: { type: Date, default: null },
    avatarUrl: { type: String, default: "", maxlength: 2000 },
    avatarPublicId: { type: String, default: "", maxlength: 500, select: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
