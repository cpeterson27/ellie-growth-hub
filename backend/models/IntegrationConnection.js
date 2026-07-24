/**
 * Integration Connection Model
 * Stores credentials and configuration for connected platforms
 */

const mongoose = require("mongoose");

const IntegrationConnectionSchema = new mongoose.Schema(
  {
    /**
     * Provider identifier
     * One of: resend, eventbrite, meetup, linkedin, facebook, instagram, x
     */
    provider: {
      type: String,
      required: true,
      unique: true,
      enum: [
        "resend",
        "eventbrite",
        "meetup",
        "linkedin",
        "facebook",
        "instagram",
        "x",
        "monday"
      ],
      index: true,
    },

    /**
     * Connection status
     * connected: Successfully authenticated and verified
     * configured: Has credentials but not verified
     * failed: Connection test failed
     * disconnected: Previously connected but removed
     */
    status: {
      type: String,
      enum: ["connected", "configured", "failed", "disconnected"],
      default: "configured",
      index: true,
    },

    /**
     * Stored credentials/configuration
     * Structure depends on provider
     * Examples:
     * - resend: { apiKey: "re_..." }
     * - eventbrite: { apiKey: "...", organizationId: "..." }
     * - linkedin: { accessToken: "...", accessTokenExpiresAt: Date }
     * - etc.
     *
     * NOTE: In production, these should be encrypted at rest
     * For MVP, stored as-is but never returned in API responses
     */
    credentials: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      select: false, // Don't return by default in queries
    },

    /**
     * Configuration for the provider
     * Non-secret settings like:
     * - organization IDs
     * - workspace IDs
     * - API versions
     * - Rate limits
     */
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // New non-secret provider configuration. `config` remains during the
    // credential migration for backwards compatibility.
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Phase 2 encrypted credential envelope. This is intentionally separate
    // from the legacy plaintext `credentials` field until each provider is
    // migrated and verified.
    credentialsEncrypted: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      select: false,
    },

    credentialFingerprint: {
      type: String,
      default: null,
      select: false,
    },

    credentialMigratedAt: {
      type: Date,
      default: null,
    },

    credentialRotationDueAt: {
      type: Date,
      default: null,
    },

    oauth: {
      scopes: {
        type: [String],
        default: [],
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      refreshFailureAt: {
        type: Date,
        default: null,
      },
      providerAccountId: {
        type: String,
        default: "",
      },
    },

    /**
     * Error message if connection failed
     */
    lastError: {
      type: String,
      default: null,
    },

    /**
     * When the provider was last verified/tested
     */
    lastVerifiedAt: {
      type: Date,
      default: null,
    },

    /**
     * When the connection was established
     */
    connectedAt: {
      type: Date,
      default: null,
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
    collection: "integration_connections",
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  },
);

// Index for common queries
IntegrationConnectionSchema.index({ status: 1, provider: 1 });

module.exports = mongoose.model(
  "IntegrationConnection",
  IntegrationConnectionSchema,
);
