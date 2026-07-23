const mongoose = require("mongoose");

const audienceSchema = new mongoose.Schema(
  {
    // -------------------------------------------------------------------------
    // Core identity
    // -------------------------------------------------------------------------

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      required: true,
      default: "draft",
    },

    // -------------------------------------------------------------------------
    // Source — how this audience was created
    // -------------------------------------------------------------------------

    source: {
      type: String,
      enum: ["manual", "ai", "import"],
      required: true,
      default: "manual",
    },

    // -------------------------------------------------------------------------
    // Discovery criteria — passed to Apollo organizations/search
    // and used to filter/score saved organizations.
    // -------------------------------------------------------------------------

    criteria: {
      // Apollo search keywords (e.g. "multifamily", "real estate")
      keywords: {
        type: [String],
        default: [],
      },

      // Industry filters (e.g. "real estate", "real estate investment trust")
      industries: {
        type: [String],
        default: [],
      },

      // Geographic filters (e.g. "United States", "California")
      locations: {
        type: [String],
        default: [],
      },

      // Company size filter — both optional so any size is acceptable if not set
      employeeRange: {
        min: { type: Number, default: null },
        max: { type: Number, default: null },
      },

      // Only organizations scoring at or above this threshold are linked to this audience
      minimumScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },

      // If set, only link organizations with this tier or better (high > medium > low > unscored)
      // null = accept all tiers
      targetTier: {
        type: String,
        enum: ["high", "medium", "low", "unscored", null],
        default: null,
      },
    },

    // -------------------------------------------------------------------------
    // Relationships — soft references, not foreign key constraints
    // -------------------------------------------------------------------------

    // Organization ObjectIds discovered/linked to this audience.
    // Soft reference only — no cascade delete, no validation constraint.
    organizationIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },

    // -------------------------------------------------------------------------
    // Discovery tracking
    // -------------------------------------------------------------------------

    lastDiscoveredAt: {
      type: Date,
      default: null,
    },

    totalOrgs: {
      type: Number,
      default: 0,
    },
  },
  {
    // Adds createdAt and updatedAt automatically
    timestamps: true,
  },
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Query by status for discovery workflows (active audiences)
audienceSchema.index({ status: 1 });

// Query by source for reporting/filtering
audienceSchema.index({ source: 1 });

// Most recent audiences for discovery UI
audienceSchema.index({ createdAt: -1 });

// Last discovered, for re-trigger workflows
audienceSchema.index({ lastDiscoveredAt: -1 });

// Composite: status + source for common queries
audienceSchema.index({ status: 1, source: 1 });

// Partial index: only active audiences
audienceSchema.index(
  { name: 1 },
  { partialFilterExpression: { status: "active" } },
);

module.exports = mongoose.model("Audience", audienceSchema);
