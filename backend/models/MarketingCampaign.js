const mongoose = require("mongoose");

/**
 * MarketingCampaign Schema
 * Tracks promotional campaigns (email, social, events)
 * NOT CRM campaigns - this is for growth/marketing activities
 */

const marketingCampaignSchema = new mongoose.Schema(
  {
    // Campaign metadata
    name: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
      maxlength: 255,
      index: true,
    },

    // Campaign type
    type: {
      type: String,
      required: [true, "Campaign type is required"],
      enum: ["email", "social", "event"],
      index: true,
    },

    // Campaign status
    status: {
      type: String,
      enum: ["draft", "scheduled", "active", "completed", "paused", "archived"],
      default: "draft",
      index: true,
    },

    // Audience association
    audienceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Audience",
      required: [true, "Campaign must be associated with an audience"],
      index: true,
    },

    // Campaign content
    content: {
      // Email-specific
      subject: String,
      body: String,
      htmlBody: String,

      // Social-specific
      caption: String,
      hashtags: [String],
      imageUrls: [String],

      // Event-specific
      eventName: String,
      eventDescription: String,
      eventDate: Date,
      eventLocation: String,

      // Common fields
      callToAction: String,
      callToActionUrl: String,
    },

    // Campaign metrics
    metrics: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      engaged: { type: Number, default: 0 },
      converted: { type: Number, default: 0 },
      _updated: { type: Date, default: Date.now },
    },

    // Integration tracking
    integrations: {
      email: {
        provider: String, // 'resend'
        campaignId: String,
        status: String,
      },
      social: {
        platforms: [
          {
            platform: String, // 'linkedin', 'facebook', 'instagram', 'x'
            postId: String,
            url: String,
            status: String,
          },
        ],
      },
      events: {
        provider: String, // 'eventbrite', 'meetup'
        eventId: String,
        url: String,
        status: String,
      },
    },

    // Scheduling
    scheduledFor: {
      type: Date,
      description: "When to launch campaign",
    },

    startedAt: {
      type: Date,
      description: "When campaign actually started",
    },

    endedAt: {
      type: Date,
      description: "When campaign completed or was paused",
    },

    // Notes
    notes: {
      type: String,
      maxlength: 1000,
      default: "",
    },

    // Admin tracking
    createdBy: String,
    updatedBy: String,
  },
  {
    timestamps: true,
    collection: "campaigns",
  },
);

// Indexes for efficient queries
marketingCampaignSchema.index({ audienceId: 1, status: 1 });
marketingCampaignSchema.index({ type: 1, status: 1 });
marketingCampaignSchema.index({ createdAt: -1 });
marketingCampaignSchema.index({ scheduledFor: 1, status: 1 });

// Soft delete for archival
marketingCampaignSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("MarketingCampaign", marketingCampaignSchema);
