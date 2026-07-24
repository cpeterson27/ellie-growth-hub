# Phase 2: Integration Credential Migration Plan

## Purpose and non-goals

Phase 2 moves provider secrets into `IntegrationConnection` through the
Integration Hub. The intent is one credential-resolution path per provider,
without changing the public behavior of lead discovery, contact sync, outreach,
or event sync.

This document is a plan only. No Phase 2 code, credential migration, provider
authentication change, or environment-variable removal is authorized until this
plan is reviewed.

## Current credential inventory

| Provider | Current secret/config location | Current consumers | Migration target |
| --- | --- | --- | --- |
| Apollo | `APOLLO_API_KEY` | `services/apollo.js` | encrypted API key in `IntegrationConnection` for `apollo` |
| Monday CRM | `IntegrationConnection.credentials` if present; fallback `MONDAY_API_KEY`, `MONDAY_CONTACTS_BOARD_ID` | `services/mondaySyncService.js`, `integrations/MondayAdapter.js`, `services/monday.js` | encrypted API key; non-secret board/workspace values in `settings` |
| Resend | `RESEND_API_KEY`; one existing connection fallback in `marketingCampaignExecution.js`; `EMAIL_FROM` is configuration | `services/email.js`, `marketingCampaignExecution.js`, `ResendAdapter` | encrypted API key; sender/domain configuration in `settings` |
| Eventbrite | `EVENTBRITE_PRIVATE_TOKEN`, `EVENTBRITE_EVENT_IDS`; legacy registry reads `EVENTBRITE_API_KEY` | `services/eventbrite.js`, `eventbriteSyncService.js`, Eventbrite adapters | encrypted token; event IDs in `settings` |
| Meetup | `MEETUP_API_KEY` or `MEETUP_ACCESS_TOKEN` | `services/meetup.js`, registry adapter | encrypted token/key; group configuration in `settings` |
| OpenAI | `OPENAI_API_KEY` | `services/llmService.js` | encrypted API key in `IntegrationConnection` for `openai` |
| Stripe | no current production consumer found; catalog reserves `STRIPE_SECRET_KEY` | future payment provider | encrypted secret/key and webhook secret |
| LinkedIn, Facebook, Instagram, X | environment tokens/secrets in the registry and `services/social.js` | social adapters/services | encrypted OAuth/API credentials plus token metadata |

MongoDB remains the application source of truth. Provider secrets are never
returned to the frontend, emitted in health output, or included in hub logs.

## Target `IntegrationConnection` schema

Keep the current collection and provider identity. Do not reuse the current
plaintext `credentials` field as the permanent encrypted container.

Add the following Phase 2 fields:

```js
{
  provider: "apollo",
  category: "lead_provider",
  status: "configured", // configured | connected | failed | disconnected
  settings: {},          // non-secret provider options only

  credentialsEncrypted: {
    ciphertext: "base64",
    iv: "base64",
    authTag: "base64",
    wrappedDataKey: "base64",
    keyId: "kms-key-id-or-alias",
    algorithm: "AES-256-GCM",
    version: 1
  },
  credentialFingerprint: "sha256-hmac", // for change detection only
  credentialMigratedAt: Date,
  credentialRotationDueAt: Date,

  oauth: {
    // token values live inside credentialsEncrypted, never here in plaintext
    scopes: ["..."],
    expiresAt: Date,
    refreshFailureAt: Date,
    providerAccountId: "non-secret-id"
  }
}
```

`credentials` remains temporarily readable only during the migration window and
is removed only after every provider has passed its production validation gate.
Existing `config` can remain as a backwards-compatible alias during migration;
new non-secret values are written to `settings`.

## Encryption strategy

Use envelope encryption with a managed key service (AWS KMS, GCP KMS, or Azure
Key Vault), selected before implementation.

1. Generate a random data-encryption key (DEK) per connection update.
2. Encrypt the serialized provider credential object using AES-256-GCM and a
   unique IV.
3. Wrap the DEK with the managed KMS key and store only the wrapped DEK,
   ciphertext, IV, authentication tag, key ID, and algorithm/version metadata
   in MongoDB.
4. Decrypt only server-side, in memory, immediately before an adapter call.
5. Zero or discard plaintext references after the call; never cache them in the
   registry, send them through APIs, or persist them in logs.
6. Use an HMAC fingerprint with a separately managed key only for detecting a
   credential change. Do not use a raw secret hash.

The application must fail closed if the KMS key is unavailable, a ciphertext
fails authentication, or the encryption version is unsupported. Development
must use an explicit local KMS emulator or test key provider; it must not use a
hardcoded encryption key.

## Adapter credential-resolution contract

Add one internal Integration Hub method in Phase 2:

```text
resolveCredentials(provider) -> { credentials, settings, source, version }
```

Adapters receive resolved credentials as an argument or through a scoped
provider context. They must not query MongoDB directly and must not read
`process.env` after their migration gate is enabled.

During transition, resolution order is deliberately explicit:

1. Valid encrypted `IntegrationConnection.credentialsEncrypted`
2. Existing plaintext `IntegrationConnection.credentials` (temporary)
3. Existing environment variables (temporary, feature-flagged fallback)

The Hub records only the source label (`encrypted_connection`,
`legacy_connection`, or `environment`) in sanitized observability. It never
records values.

## Provider migration sequence

Migrate one provider at a time, starting with a reversible low-risk provider.

1. Add provider support to the `IntegrationConnection` enum/metadata without
   changing its active call path.
2. Add an admin-only, server-side connection update path that encrypts on write
   and returns a redacted response.
3. Run a provider-specific verification using the encrypted record in staging.
4. Enable encrypted-first resolution for that provider behind a feature flag.
5. Validate its real workflow and observability metrics.
6. Keep the environment fallback enabled for a defined observation window.
7. Remove plaintext connection and environment fallback only after approval.

Recommended order: Resend, Monday CRM, Eventbrite, Apollo, OpenAI, then the
remaining providers. This separates email delivery, sync, discovery, and AI
rollback domains.

## OAuth support

OAuth-capable providers (Monday, Eventbrite where applicable, Meetup, LinkedIn,
Meta providers, and Microsoft/Google providers added later) require a dedicated
authorization-code flow.

- Store access token, refresh token, token type, and client secret only inside
  `credentialsEncrypted`.
- Store scopes, expiration, provider account ID, and consent timestamps as
  non-secret metadata.
- Use `state` with a short TTL, PKCE where supported, exact redirect URI
  validation, and one-time code exchange.
- Refresh tokens server-side only; never send access or refresh tokens to the
  frontend.
- Mark the connection `failed` or `configuration_required` on refresh failure
  without deleting the encrypted record. Require explicit reauthorization.

API-key providers (Apollo, Resend, OpenAI, and many Stripe deployments) use the
same encrypted connection path but do not use OAuth fields.

## Security controls

- Restrict credential write/read operations to authorized server-side roles.
- Use MongoDB field selection to exclude every credential field by default.
- Redact credentials, authorization headers, recipient lists, email bodies,
  provider error bodies, and OAuth codes from logs and traces.
- Apply request size limits and schema validation to connection updates.
- Audit connection create/update/disconnect and key-rotation events with actor,
  provider, timestamp, and outcome only.
- Rotate credentials on provider compromise, employee departure, scheduled
  rotation, and KMS key rotation.
- Back up encrypted data; protect the KMS key and database backups with separate
  access controls.
- Never copy production secrets to test fixtures, documentation, browser state,
  or client-visible API responses.

## Rollout and rollback

Each provider gets its own feature flag, for example
`INTEGRATION_CREDENTIAL_SOURCE_RESEND=encrypted_first`.

Rollback triggers include send/sync failures above the agreed baseline,
authentication verification failures, decryption failures, or a mismatch between
existing and migrated provider results.

Rollback steps:

1. Set that provider’s resolution flag to `environment_only`.
2. Leave encrypted and legacy records intact; do not delete secrets while
   investigating.
3. Confirm the legacy workflow with a provider-specific smoke test.
4. Review sanitized Integration Hub execution telemetry and KMS audit logs.
5. Fix and retest in staging before re-enabling encrypted-first resolution.

The migration is complete only after a defined observation window succeeds and
an explicit change removes environment and plaintext fallbacks.

## Test plan and release gates

Before production migration, add automated tests for:

- encrypt/decrypt round trips, tamper detection, unsupported versions, and KMS
  failures;
- redaction guarantees for API responses and execution logs;
- resolver precedence across encrypted, legacy connection, and environment
  values;
- provider adapter behavior with an injected credential context;
- OAuth state, PKCE, token refresh, expiry, and reauthorization failure paths;
- database migration idempotency and rollback to the legacy source.

In staging, run one provider at a time using provider sandbox/test credentials:

| Provider | Required workflow check |
| --- | --- |
| Resend | Send a test email to a controlled inbox; verify message ID and no secret logging. |
| Monday CRM | Verify connection and sync a controlled board without duplicate contacts. |
| Eventbrite | Verify account and sync attendees from a controlled event. |
| Apollo | Run a minimal discovery query and verify normalization without automatic import. |
| OpenAI | Run a non-production health/completion check with redacted telemetry. |

Production release gates: security review of the KMS design, schema migration
review, successful staging tests, documented provider rollback owner, monitoring
dashboard ready, and explicit approval before enabling each provider flag.
