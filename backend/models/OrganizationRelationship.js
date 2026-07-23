const mongoose = require("mongoose");

const organizationRelationshipSchema = new mongoose.Schema(
  {
    // -------------------------------------------------------------------------
    // Core references
    // -------------------------------------------------------------------------

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    audienceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Audience",
      required: true,
      index: true,
    },

    // -------------------------------------------------------------------------
    // Relationship state
    // -------------------------------------------------------------------------

    status: {
      type: String,
      enum: [
        "new",
        "reviewing",
        "qualified",
        "partner",
        "customer",
        "rejected",
      ],
      required: true,
      default: "new",
      index: true,
    },

    // Priority for organization focus (1-10)
    priority: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },

    // Relationship type
    relationshipType: {
      type: String,
      default: "prospect",
    },

    // -------------------------------------------------------------------------
    // Human context — why is it in this state?
    // -------------------------------------------------------------------------

    notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    // -------------------------------------------------------------------------
    // Tracking — when did the relationship state last change?
    // -------------------------------------------------------------------------

    lastChangedAt: {
      type: Date,
      default: Date.now,
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

// Lookup org's status in a specific audience
organizationRelationshipSchema.index(
  { organizationId: 1, audienceId: 1 },
  { unique: true },
);

// List organizations for an audience filtered by status
organizationRelationshipSchema.index({ audienceId: 1, status: 1 });

// Find all statuses for a specific organization
organizationRelationshipSchema.index({ organizationId: 1, status: 1 });

// Find recently changed relationships for an audience
organizationRelationshipSchema.index({ audienceId: 1, lastChangedAt: -1 });

module.exports = mongoose.model(
  "OrganizationRelationship",
  organizationRelationshipSchema,
);
