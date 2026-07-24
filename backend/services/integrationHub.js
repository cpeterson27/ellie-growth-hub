const IntegrationConnection = require("../models/IntegrationConnection");
const integrationRegistry = require("./integrations");
const defaultProviders = require("./integrations/providerCatalog");
const { decryptCredentials } = require("../utils/credentialEncryption");

class IntegrationHub {
  constructor() {
    this.providers = new Map();
    defaultProviders.forEach((provider) => this.registerProvider(provider));
  }

  registerProvider(provider) {
    if (!provider?.id || !provider.name || !provider.category) {
      throw new Error("Provider id, name, and category are required");
    }

    this.providers.set(provider.id, { ...provider });
  }

  getProvider(providerId) {
    return this.providers.get(providerId) || null;
  }

  async execute(providerId, operation, ...args) {
    const provider = this.getProvider(providerId);
    const adapter = integrationRegistry.get(providerId);

    if (!provider || !adapter) {
      throw new Error(`Provider "${providerId}" is not available`);
    }

    if (typeof adapter[operation] !== "function") {
      throw new Error(
        `Provider "${providerId}" does not support ${operation}()`,
      );
    }

    const timestamp = new Date().toISOString();
    const startedAt = Date.now();

    try {
      const credentialContext = providerId === "resend"
        ? await this.resolveCredentials(providerId)
        : null;
      const result = credentialContext
        ? await adapter[operation](...args, credentialContext)
        : await adapter[operation](...args);
      console.info("[IntegrationHub] provider execution", {
        provider: providerId,
        operation,
        timestamp,
        success: true,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      console.info("[IntegrationHub] provider execution", {
        provider: providerId,
        operation,
        timestamp,
        success: false,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  async getHealth() {
    const providers = await this.listProviders();
    const lastChecked = new Date().toISOString();

    return Promise.all(providers.map(async (provider) => {
      const adapter = integrationRegistry.get(provider.id);
      const adapterStatus = adapter ? await adapter.status() : null;

      return {
        provider: provider.id,
        category: provider.category,
        registered: Boolean(this.getProvider(provider.id)),
        adapterLoaded: Boolean(adapter),
        configured: provider.status !== "disconnected",
        capabilities: provider.capabilities,
        lastChecked,
        adapterStatus,
      };
    }));
  }

  getCapabilities(providerId) {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return null;
    }

    return {
      provider: provider.id,
      category: provider.category,
      capabilities: provider.capabilities,
    };
  }

  async listProviders() {
    const connections = await IntegrationConnection.find().select(
      "provider status config lastError lastVerifiedAt connectedAt updatedAt",
    );
    const connectionsByProvider = new Map(
      connections.map((connection) => [connection.provider, connection]),
    );

    return [...this.providers.values()].map((provider) => {
      const connection = connectionsByProvider.get(provider.id);
      const adapter = integrationRegistry.get(provider.id);
      const hasEnvironmentConfiguration = provider.environmentKeys.some(
        (key) => Boolean(process.env[key]),
      );
      const isConnected = provider.builtIn || connection?.status === "connected" ||
        (!connection && hasEnvironmentConfiguration);
      const status = isConnected
        ? (provider.builtIn ? "ready" : "connected")
        : connection?.status === "configured"
          ? "configuration_required"
          : "disconnected";

      return {
        ...provider,
        status,
        adapterRegistered: Boolean(adapter),
        connection: connection
          ? {
              connectedAt: connection.connectedAt,
              lastVerifiedAt: connection.lastVerifiedAt,
              lastError: connection.lastError,
              updatedAt: connection.updatedAt,
            }
          : null,
      };
    });
  }

  async resolveCredentials(providerId) {
    // Resend remains environment-first by default, matching its existing
    // production behavior. The encrypted path is enabled only by an explicit
    // provider feature flag during the proof of concept.
    if (providerId === "resend") {
      const strategy = process.env.INTEGRATION_CREDENTIAL_SOURCE_RESEND ||
        "env_first";
      const encryptedFirst = strategy === "encrypted_first";

      // Preserve the legacy path without even querying MongoDB when the
      // default environment source is configured.
      if (!encryptedFirst && process.env.RESEND_API_KEY) {
        return {
          credentials: { apiKey: process.env.RESEND_API_KEY },
          settings: {},
          source: "environment",
        };
      }

      const connection = await IntegrationConnection.findOne({ provider: providerId })
        .select("+credentials +credentialsEncrypted settings config");
      const settings = connection?.settings || connection?.config || {};
      const sources = encryptedFirst
        ? ["encrypted", "environment", "legacy_connection"]
        : ["environment", "legacy_connection", "encrypted"];

      for (const source of sources) {
        if (source === "environment" && process.env.RESEND_API_KEY) {
          return {
            credentials: { apiKey: process.env.RESEND_API_KEY },
            settings,
            source,
          };
        }

        if (source === "legacy_connection" && connection?.credentials) {
          return {
            credentials: connection.credentials,
            settings,
            source,
          };
        }

        if (source === "encrypted" && connection?.credentialsEncrypted) {
          return {
            credentials: decryptCredentials(connection.credentialsEncrypted),
            settings,
            source,
          };
        }
      }
    }

    return { credentials: null, settings: {}, source: "unconfigured" };
  }
}

module.exports = new IntegrationHub();
