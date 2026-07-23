/**
 * Growth Opportunity Model
 * Stores identified marketing opportunities during operator analysis
 */

const mongoose = require("mongoose");

const GrowthOpportunitySchema = new mongoose.Schema(
  {
    /**
     * Reference to the Growth Operator that identified this opportunity
     */
    growthOperatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GrowthOperator",
      required: true,
      index: true,
    },

    /**
     * The organization this opportunity is for
     */
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    /**
     * The audience context
     */
    audienceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Audience",
      required: true,
      index: true,
    },

    /**
     * Type of opportunity identified
     * high_priority: Organization is high priority but no recent engagement
     * needs_campaign: Good fit but no campaigns running
     * relationship_update: Relationship status should be updated
     * engagement_needed: Low engagement, needs outreach
     * new_organization: Newly discovered, good fit
     */
    opportunityType: {
      type: String,
      enum: [
        "high_priority",
        "needs_campaign",
        "relationship_update",
        "engagement_needed",
        "new_organization",
      ],
      required: true,
      index: true,
    },

    /**
     * Why this opportunity was identified
     */
    reasons: [String],

    /**
     * Priority score for this opportunity (0-100)
     */
    priorityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },

    /**
     * Suggested action to take
     */
    suggestedAction: {
      type: String,
      enum: [
        "create_campaign",
        "update_relationship",
        "send_outreach",
        "review_manually",
      ],
      required: true,
    },

    /**
     * Campaign details if suggestedAction is create_campaign
     */
    suggestedCampaign: {
      type: { type: String, enum: ["email", "social", "event"] },
      name: String,
      description: String,
    },

    /**
     * Relationship update details if applicable
     */
    suggestedRelationshipUpdate: {
      currentStatus: String,
      recommendedStatus: String,
      reason: String,
    },

    /**
     * Status of this opportunity
     * identified: Found during analysis
     * actioned: Action was taken
     * skipped: User chose to skip
     * expired: No longer relevant
     */
    status: {
      type: String,
      enum: ["identified", "actioned", "skipped", "expired"],
      default: "identified",
      index: true,
    },

    /**
     * If actioned, what was the action
     */
  actionTaken: {
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MarketingCampaign",
  },
  relationshipUpdateId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  timestamp: Date,
  note: String,
},

    /**
     * Metadata
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

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
    collection: "growth_opportunities",
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  },
);

// Indexes
GrowthOpportunitySchema.index({ growthOperatorId: 1, status: 1 });
GrowthOpportunitySchema.index({ organizationId: 1, audienceId: 1 });
GrowthOpportunitySchema.index({ opportunityType: 1, status: 1 });

module.exports = mongoose.model("GrowthOpportunity", GrowthOpportunitySchema);
