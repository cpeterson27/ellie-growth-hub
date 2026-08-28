const mongoose = require("mongoose");

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    billingStatus: {
      type: String,
      enum: ["setup", "trialing", "active", "past_due", "canceled"],
      default: "setup",
    },
    rolePermissionTemplates: { type: Map, of: [String], default: undefined },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Workspace", workspaceSchema);
