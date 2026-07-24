# Resend Credential Migration Proof of Concept

## Scope

This proof of concept adds encrypted credential schema support and Hub
resolution for Resend only. It does not write, migrate, or remove any existing
credential. The production default remains `RESEND_API_KEY`.

## Opt-in staging validation

1. Provision `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` as a base64-encoded,
   cryptographically random 32-byte key through the deployment secret manager.
2. Create an encrypted `credentialsEncrypted` envelope for the existing Resend
   API key in the `IntegrationConnection` record. Do this with an approved,
   server-side migration procedure; never copy the key into a browser or log.
3. Set `INTEGRATION_CREDENTIAL_SOURCE_RESEND=encrypted_first` in staging.
4. Send a controlled test email and verify delivery, message ID persistence,
   and sanitized Integration Hub telemetry.
5. Remove the feature flag and repeat the test to confirm environment fallback.

## Read precedence

Default and `INTEGRATION_CREDENTIAL_SOURCE_RESEND=env_first`: environment ->
legacy connection -> encrypted connection.

With `INTEGRATION_CREDENTIAL_SOURCE_RESEND=encrypted_first`: encrypted
connection -> environment -> legacy connection.

An invalid encrypted envelope fails the send while encrypted-first is enabled;
disable the flag to roll back immediately to environment credentials.

## Production gate

Do not enable encrypted-first in production until staging verification, key
management review, rollback ownership, and a controlled-email test are approved.
