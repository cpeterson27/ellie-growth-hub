/**
 * Growth Operator Model
 * Tracks workflow orchestration instances
 */

const mongoose = require("mongoose");

const GrowthOperatorSchema = new mongoose.Schema(
  {
    /**
     * The audience being analyzed
     */
    audienceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Audience",
      required: true,
      index: true,
    },

    /**
     * Workflow status
     * active: Currently analyzing
     * paused: Halted (user pause)
     * completed: Analysis finished
     * failed: Error during analysis
     */
    status: {
      type: String,
      enum: ["active", "paused", "completed", "failed"],
      default: "active",
      index: true,
    },

    /**
     * Workflow configuration
     */
    config: {
      minPriorityScore: { type: Number, default: 0 },
      maxOrganizationsToProcess: { type: Number, default: 1000 },
      campaignTypes: {
        type: [String],
        enum: ["email", "social", "event"],
        default: ["email", "social", "event"],
      },
      relationshipStatuses: {
        type: [String],
        enum: [
          "new",
          "reviewing",
          "qualified",
          "partner",
          "customer",
          "rejected",
        ],
        default: ["new", "reviewing"],
      },
    },

    /**
     * Analysis metrics
     */
    metrics: {
      organizationsAnalyzed: { type: Number, default: 0 },
      opportunitiesIdentified: { type: Number, default: 0 },
      campaignsRecommended: { type: Number, default: 0 },
      campaignsCreated: { type: Number, default: 0 },
      relationshipUpdatesRecommended: { type: Number, default: 0 },
    },

    /**
     * Error tracking
     */
    lastError: String,
    errorCount: { type: Number, default: 0 },

    /**
     * Timing
     */
    analyzedAt: Date,
    completedAt: Date,

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: "growth_operators",
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  },
);

// Indexes
GrowthOperatorSchema.index({ audienceId: 1, status: 1 });
GrowthOperatorSchema.index({ createdAt: -1 });

module.exports = mongoose.model("GrowthOperator", GrowthOperatorSchema);
