const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    // -------------------------------------------------------------------------
    // Identity — domain is the source-of-truth deduplication key.
    // Apollo IDs and other external IDs are metadata, not keys.
    // -------------------------------------------------------------------------

    name: {
      type: String,
      required: true,
      trim: true,
    },

    domain: {
      type: String,
      required: false,
      default: null,
      lowercase: true,
      trim: true,
    },

    source: {
      type: String,
      enum: ["apollo", "manual", "eventbrite", "meetup"],
      required: true,
      default: "apollo",
    },

    // -------------------------------------------------------------------------
    // Apollo external metadata.
    // apolloId is a convenience lookup only — never used as a DB key.
    // externalSources stores additional per-provider raw identifiers for
    // deduplication and future re-enrichment without over-fetching.
    // -------------------------------------------------------------------------

    apolloId: {
      type: String,
      default: null,
    },

    externalSources: {
      apollo: {
        id: { type: String, default: null },
        enrichedAt: { type: Date, default: null },
      },
    },

    // -------------------------------------------------------------------------
    // Company intelligence — populated from organizations/enrich.
    // -------------------------------------------------------------------------

    website: {
      type: String,
      default: "",
      trim: true,
    },

    industry: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    employeeCount: {
      type: Number,
      default: null,
    },

    location: {
      type: String,
      default: "",
    },

    linkedinUrl: {
      type: String,
      default: "",
    },

    founded: {
      type: Number,
      default: null,
    },

    phone: {
      type: String,
      default: "",
    },

    keywords: {
      type: [String],
      default: [],
    },

    // -------------------------------------------------------------------------
    // Audience intelligence — scored by Ellie AI, not by Apollo.
    // audienceScore: 0–100 composite fit score.
    // audienceTier:  human-readable priority tier derived from score.
    // scoreReasons:  plain-language explanations for the score.
    // -------------------------------------------------------------------------

    audienceScore: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },

    audienceTier: {
      type: String,
      enum: ["high", "medium", "low", "unscored"],
      required: true,
      default: "unscored",
    },

    scoreReasons: {
      type: [String],
      default: [],
      // Example values:
      // "Real estate industry"
      // "Multifamily keyword match"
      // "Target employee range (5–500)"
    },

    // -------------------------------------------------------------------------
    // Provenance — when and how this org was discovered and last updated.
    // -------------------------------------------------------------------------

    discoveredAt: {
      type: Date,
      default: Date.now,
    },

    // Ellie-level enrichment timestamp — set when Ellie processes and
    // scores this org, regardless of which external source was used.
    enrichedAt: {
      type: Date,
      default: null,
    },

    // -------------------------------------------------------------------------
    // Organization priority and action readiness.
    // Priority is different from audienceScore:
    // - audienceScore: "How well does this org match the audience?"
    // - priorityScore: "How important should Ellie consider this org right now?"
    // -------------------------------------------------------------------------

    priorityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    priorityTier: {
      type: String,
      enum: ["hot", "warm", "cold"],
      default: "cold",
    },

    priorityReasons: {
      type: [String],
      default: [],
      // Example values:
      // "High audience fit score (90/100)"
      // "Real estate industry match"
      // "Strong multifamily keyword overlap"
      // "Recently discovered (2 days ago)"
    },

    // Breakdown of signals used to calculate priority
    prioritySignals: {
      audienceFit: { type: Number, default: 0, min: 0, max: 40 },
      industryMatch: { type: Number, default: 0, min: 0, max: 15 },
      companySize: { type: Number, default: 0, min: 0, max: 15 },
      keywordMatch: { type: Number, default: 0, min: 0, max: 10 },
      dataQuality: { type: Number, default: 0, min: 0, max: 10 },
      recency: { type: Number, default: 0, min: 0, max: 10 },
    },

    // Timestamp when priority was last calculated (triggers recalc if stale)
    priorityCalculatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    // Adds createdAt and updatedAt automatically.
    timestamps: true,
  },
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Domain dedup — sparse so that domain-less orgs (manual, Meetup, etc.)
// do not collide on null. Only one record allowed per unique domain value.
organizationSchema.index({ domain: 1 }, { unique: true, sparse: true });

// Apollo external ID lookup — sparse so null apolloIds don't conflict.
organizationSchema.index({ apolloId: 1 }, { sparse: true });

// Audience filtering — Ellie AI queries orgs by tier for outreach targeting.
organizationSchema.index({ audienceTier: 1 });

// Score sorting — for ranked org lists in discovery results.
organizationSchema.index({ audienceScore: -1 });

// Source + tier composite — for filtered discovery queries per provider.
organizationSchema.index({ source: 1, audienceTier: 1 });

// Priority sorting — for prioritized org lists and filtering.
organizationSchema.index({ priorityScore: -1 });

// Priority tier filtering — for hot/warm/cold views.
organizationSchema.index({ priorityTier: 1 });

// Priority recency — identify stale priorities that need recalculation.
organizationSchema.index({ priorityCalculatedAt: -1 });

// Composite: priority + audience tier — for combined views.
organizationSchema.index({ priorityTier: 1, audienceTier: 1 });

module.exports = mongoose.model("Organization", organizationSchema);
