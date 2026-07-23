const mongoose = require("mongoose");

const discoveryRunSchema = new mongoose.Schema(
  {
    // -------------------------------------------------------------------------
    // Core reference
    // -------------------------------------------------------------------------

    audienceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Audience",
      required: true,
      index: true,
    },


    // -------------------------------------------------------------------------
    // Execution status
    // -------------------------------------------------------------------------

    status: {
      type: String,
      enum: ["success", "partial", "failed"],
      default: "success",
      required: true,
    },


    // -------------------------------------------------------------------------
    // Discovery criteria snapshot
    // -------------------------------------------------------------------------

    criteriaSnapshot: {

      keywords: {
        type: [String],
        default: [],
      },

      industries: {
        type: [String],
        default: [],
      },

      locations: {
        type: [String],
        default: [],
      },

      employeeRange: {
        min: {
          type: Number,
          default: null,
        },

        max: {
          type: Number,
          default: null,
        },
      },

      minimumScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },

      targetTier: {
        type: String,
        enum: [
          "high",
          "medium",
          "low",
          "unscored",
          null,
        ],
        default: null,
      },

    },


    // -------------------------------------------------------------------------
    // Discovery statistics
    // -------------------------------------------------------------------------

    statistics: {

      organizationsFound: {
        type: Number,
        default: 0,
        min: 0,
      },

      organizationsCreated: {
        type: Number,
        default: 0,
        min: 0,
      },

      organizationsUpdated: {
        type: Number,
        default: 0,
        min: 0,
      },

      duplicatesSkipped: {
        type: Number,
        default: 0,
        min: 0,
      },

      enrichmentFailed: {
        type: Number,
        default: 0,
        min: 0,
      },

      persistenceFailed: {
        type: Number,
        default: 0,
        min: 0,
      },

    },


    // -------------------------------------------------------------------------
    // Organizations touched during this run
    // -------------------------------------------------------------------------

    organizationIds: {
      type: [
        mongoose.Schema.Types.ObjectId,
      ],
      default: [],
    },


    // -------------------------------------------------------------------------
    // Score distribution snapshot
    // -------------------------------------------------------------------------

    scoreDistribution: {

      high: {
        type: Number,
        default: 0,
        min: 0,
      },

      medium: {
        type: Number,
        default: 0,
        min: 0,
      },

      low: {
        type: Number,
        default: 0,
        min: 0,
      },

      unscored: {
        type: Number,
        default: 0,
        min: 0,
      },

    },


    // -------------------------------------------------------------------------
    // Pagination tracking
    // -------------------------------------------------------------------------

    pagination: {

      totalPages: {
        type: Number,
        default: 0,
        min: 0,
      },

      availableOrganizationsFromSearch: {
        type: Number,
        default: 0,
        min: 0,
      },

      stoppedReason: {
        type: String,
        enum: [
          "max_cap_reached",
          "no_more_results",
          "rate_limited",
          "error",
          null,
        ],
        default: null,
      },

    },


    // -------------------------------------------------------------------------
    // Error tracking
    //
    // Renamed from "errors"
    // because Mongoose reserves that pathname.
    // -------------------------------------------------------------------------

    errorDetails: {

      enrichmentRateLimitHit: {
        type: Boolean,
        default: false,
      },


      enrichmentErrorCount: {
        type: Number,
        default: 0,
        min: 0,
      },


      message: {
        type: String,
        default: "",
        trim: true,
      },

    },


    // -------------------------------------------------------------------------
    // Timing
    // -------------------------------------------------------------------------

    startedAt: {
      type: Date,
      required: true,
    },


    completedAt: {
      type: Date,
      required: true,
    },

  },
  {
    timestamps: true,
  }
);



// -----------------------------------------------------------------------------
// Indexes
// -----------------------------------------------------------------------------

discoveryRunSchema.index({
  audienceId: 1,
  createdAt: -1,
});


discoveryRunSchema.index({
  audienceId: 1,
  completedAt: -1,
});


discoveryRunSchema.index({
  audienceId: 1,
  status: 1,
});


discoveryRunSchema.index({
  audienceId: 1,
  "statistics.organizationsCreated": -1,
});


discoveryRunSchema.index({
  "errorDetails.enrichmentRateLimitHit": 1,
});


discoveryRunSchema.index({
  audienceId: 1,
  status: 1,
  completedAt: -1,
});


module.exports = mongoose.model(
  "DiscoveryRun",
  discoveryRunSchema
);