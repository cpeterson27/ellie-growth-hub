# Work Unit 5 Release Manifest

Release preparation date: 2026-08-24  
Target branch: `main`  
Production execution status: **NOT AUTHORIZED / NOT STARTED**

This manifest freezes the production prerequisites for the completed Growth Operator release. It does not authorize a push, deployment, production database operation, DNS change, OAuth connection, webhook registration, provider call, message, meeting, event, or social publication.

## Release contents

The release preserves the existing Sales CRM, Lead Generator, Outreach, Eventbrite, Jarvis and communications surfaces and adds the completed multi-role/capability foundation, Coaching CRM and Coach Portal, coaching history and handoffs, referrals and commissions, per-coach Calendar/Zoom foundations, Skool adapter boundary, consent-aware communications, social lead attribution, automation/analytics, workspace-specific public website/application, Ellie workspace branding, launch readiness, and human-approved social publishing queue.

Ellie is the first workspace. Branding and public configuration remain workspace-scoped; `/elliescoachinglogo.png` is an Ellie default and is not the global SaaS logo. MongoDB remains canonical. Supabase is not part of this architecture.

## Required pre-deployment gates

1. Push only the reviewed release commit after explicit approval.
2. Confirm Render services, repository, branch and current production environment without exposing secret values.
3. Take and verify a restorable production MongoDB backup.
4. Run every audit below before its corresponding apply operation.
5. Stop on unowned records, duplicate keys, cross-workspace references, unexpected indexes, missing secrets or migration errors.
6. Deploy the backend before exposing new frontend routes, then apply approved migrations during the maintenance window.
7. Deploy and verify the frontend on its Render hostname before any domain change.

## Required database audits and migrations

Run from the backend service environment using `MONGO_URI`. These operations make no provider calls.

| Order | Command | Mode | Requirement |
| --- | --- | --- | --- |
| 1 | `npm run tenant:audit` | Read only | Must report no ambiguous/unassigned records. Production ownership migration was previously documented complete; verify rather than assume. |
| 2 | `npm run tenant:indexes:audit` | Read only | Must report no duplicate/conflicting tenant keys. |
| 3 | `npm run memberships:roles:audit` | Read only | Record the exact proposed `roles[]` backfill. |
| 4 | `npm run tenant:migrate` | Write, only if audit proves needed | Do not rerun merely because it exists. |
| 5 | `npm run tenant:indexes:migrate` | Write, only if audit proves needed | Apply only after backup and explicit approval. |
| 6 | `npm run memberships:roles:migrate` | Write | Backfill canonical multi-role membership data. |
| 7 | `npm run calendar:scopes:migrate` | Write | Backfill workspace-scoped integration connections, remove the legacy workspace/provider singleton index and synchronize coach-owned Calendar/Zoom indexes. |

New additive collections and indexes are created by the deployed Mongoose models. Inspect production startup/index behavior and confirm the required indexes exist after migration. Never apply an index change when the audit reports duplicates or an unexpected legacy definition.

## Environment-variable names

Values belong only in Render/backend secret settings unless explicitly identified as frontend-safe. Never print secrets in logs or place provider secrets in `VITE_*` values.

### Core backend

- `NODE_ENV=production`
- `MONGO_URI`
- `FRONTEND_URL`
- `PUBLIC_BACKEND_URL`
- `BACKEND_URL`
- `PUBLIC_WORKSPACE_SLUG`
- `ELLIE_WORKSPACE_SLUG`
- `TENANT_QUERY_ENFORCEMENT=enabled`
- `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`
- `UNSUBSCRIBE_SIGNING_SECRET`
- `PORT` (normally assigned by Render)
- `RENDER_EXTERNAL_URL` (assigned by Render)

### Frontend-safe build configuration

- `VITE_API_BASE_URL`

### Email and SMS (keep outbound disabled initially)

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `INTEGRATION_CREDENTIAL_SOURCE_RESEND`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_TWIML_URL`

### Google and Zoom (do not connect initially)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_REDIRECT_URI`
- `ZOOM_WEBHOOK_SECRET_TOKEN`

### Meta and LinkedIn (do not connect or publish initially)

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `META_GRAPH_API_VERSION`
- `META_OAUTH_SCOPES`
- `META_WEBHOOK_VERIFY_TOKEN`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI`
- `LINKEDIN_OAUTH_SCOPES`
- `LINKEDIN_API_VERSION`

### Existing/optional integrations

- `EVENTBRITE_PRIVATE_TOKEN`
- `EVENTBRITE_EVENT_IDS`
- `EVENTBRITE_ORGANIZATION_ID`
- `EVENTBRITE_CLIENT_ID`
- `EVENTBRITE_CLIENT_SECRET`
- `EVENTBRITE_REDIRECT_URI`
- `EVENTBRITE_WEBHOOK_TOKEN`
- `DEAL_TO_CLOSE_CAMPAIGN_ID`
- `CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `GOOGLE_SEARCH_API_KEY`
- `GOOGLE_SEARCH_ENGINE_ID`
- `ELLIE_BUSINESS_DATA_API_URL`
- `ELLIE_BUSINESS_DATA_API_KEY`
- `EMAILABLE_API_KEY`
- `MONDAY_API_KEY`
- `MONDAY_CONTACTS_BOARD_ID`
- `MEETUP_API_KEY`
- `MEETUP_ACCESS_TOKEN`
- `X_API_KEY`
- `X_API_SECRET`
- `X_BEARER_TOKEN`

### Jarvis and AI (keep paid generation disabled initially)

- `OPENAI_API_KEY` (omit until approved if not otherwise needed)
- `JARVIS_OPENAI_ENABLED=false`
- `JARVIS_OPENAI_MODEL`
- `JARVIS_RESEARCH_OPENAI_MODEL`
- `JARVIS_TTS_MODEL`
- `BUSINESS_CARD_OPENAI_MODEL`
- `INTENT_CLASSIFICATION_OPENAI_MODEL`
- `MARKET_RESEARCH_AI_ENABLED=false`
- `MARKET_RESEARCH_OPENAI_MODEL`
- `JARVIS_MEMORY_SOURCE`
- `JARVIS_MEMORY_SYNC_SECRET` (legacy only; must also set `JARVIS_MEMORY_SYNC_WORKSPACE_ID`)
- `JARVIS_MEMORY_SYNC_CREDENTIALS` (preferred workspace-bound JSON map)
- `JARVIS_MEMORY_SYNC_WORKSPACE_ID` (required only during legacy single-secret migration)
- `OBSIDIAN_WORKSPACE_ID` (local vault workspace binding)
- `DEVELOPMENT_APPROVAL_SECRET`

## Worker configuration

Only one execution path may claim each queue.

### Recommended production layout

- Backend web service: `npm start`
- Dedicated worker service: `npm run start:worker`
- Backend web service: `RESEARCH_WORKER_MODE=external`
- Dedicated worker: `RESEARCH_WORKER_MODE=external` is not required; `worker.js` starts research explicitly.
- Set `COMMUNICATION_WORKER_MODE=external` on the web service if communications run in the dedicated worker.
- Set `AUTOMATION_WORKER_MODE=external` on the web service if automations run in the dedicated worker.
- Keep `RUN_SOCIAL_PUBLISHING_IN_PROCESS` unset/false on the web service; `worker.js` starts social publishing explicitly.
- Optional tuning: `RESEARCH_WORKER_POLL_MS`, `RESEARCH_WORKER_LEASE_MS`, `COMMUNICATION_WORKER_INTERVAL_MS`, `AUTOMATION_WORKER_INTERVAL_MS`.

Before enabling outbound providers, workers may run only with no approved outbound jobs, no scheduled social publications and outbound automations disabled. Confirm atomic claims and idempotency from sanitized logs.

## Features disabled at initial deployment

- All scheduled/automatic email sends and newsletters.
- All scheduled/automatic SMS, MMS, WhatsApp, voice calls and recordings.
- All Google Calendar OAuth connections and event creation/update/cancellation.
- All Zoom OAuth connections, meeting creation/update/cancellation and live webhook processing.
- Skool/Zapier dispatch and live membership actions.
- Meta OAuth reconnection, outbound replies, comment automation and Facebook/Instagram publishing.
- LinkedIn OAuth reconnection and organization publishing.
- X and TikTok publishing; these remain human-assisted/unavailable.
- OpenAI-backed Jarvis generation, market-research generation, TTS and other paid AI calls.
- Paid email verification and batch lead-data/search operations.
- New Eventbrite event creation or repeated live sync tests.
- Stripe operations (no launch implementation is required).
- ManyChat and Supabase (not dependencies).
- Public automations capable of outbound provider actions until each dependency passes one separately approved controlled test.

Public site publication and application acceptance are separate production decisions. During the first controlled application submission, outbound automations must remain disabled.

## Rollback procedure

1. Stop the release and do not change DNS while backend/frontend verification is incomplete.
2. Disable outbound automations and pause communication/social queues before rollback.
3. Roll the Render backend and frontend back to the immediately previous known-good commit/deploy.
4. Keep provider connections and encrypted credentials intact; do not delete secrets while investigating.
5. If a provider-specific credential resolver causes failures, restore its documented environment-only/fallback mode without deleting encrypted records.
6. Database rollback must use the verified pre-deployment backup or a migration-specific, reviewed reversal. Do not use destructive ad-hoc updates.
7. If a migration partially fails, stop workers, preserve logs and receipts, run read-only reconciliation, and restore only after identifying the exact affected collections/indexes.
8. If DNS has later moved, retain the old Vercel project during the observation window and use the recorded pre-change DNS values only with explicit rollback approval.
9. Re-run health, authentication, workspace isolation, Sales CRM and role checks after rollback.
10. Record the incident, affected commit, migration state and provider actions before attempting another release.

## Production verification boundary

Initial deployment verification is limited to health, public GET routes, authentication, RBAC, tenancy, Sales CRM, Coaching CRM read paths and queue/readiness inspection. Every real provider test requires a separate approval naming the provider and the exact number of messages, posts, events, meetings, calls or API actions. One controlled end-to-end test per provider is sufficient after mocked verification.
