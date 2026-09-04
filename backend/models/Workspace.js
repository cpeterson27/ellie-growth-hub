const mongoose = require("mongoose");

const PUBLIC_HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
    publicHosts: {
      type: [String],
      default: [],
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          new Set(values).size === values.length &&
          values.every((value) => PUBLIC_HOST.test(String(value))),
        message: "Public hosts must be unique valid hostnames",
      },
    },
    billingStatus: {
      type: String,
      enum: ["setup", "trialing", "active", "past_due", "canceled"],
      default: "setup",
    },
    rolePermissionTemplates: { type: Map, of: [String], default: undefined },
  },
  { timestamps: true },
);

workspaceSchema.index({ publicHosts: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Workspace", workspaceSchema);
