/**
 * Monday Sync History Model
 * Tracks each sync operation and its results
 */

const mongoose = require("mongoose");

const syncHistorySchema = new mongoose.Schema(
  {
    // Sync operation details
    syncId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    durationMs: {
      type: Number, // milliseconds
      required: true,
    },

    // Sync results
    status: {
      type: String,
      enum: ["success", "failed", "partial"],
      default: "success",
    },
    created: {
      type: Number,
      default: 0,
    },
    updated: {
      type: Number,
      default: 0,
    },
    duplicates: {
      type: Number,
      default: 0,
    },
    skipped: {
      type: Number,
      default: 0,
    },
    totalProcessed: {
      type: Number,
      default: 0,
    },

    // Error tracking
    error: {
      type: String,
      default: null,
    },
    errorStack: {
      type: String,
      default: null,
    },

    // Message summary
    message: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// Index for finding recent syncs
syncHistorySchema.index({ createdAt: -1 });
syncHistorySchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("MondaySyncHistory", syncHistorySchema);
