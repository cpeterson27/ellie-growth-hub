# Current build status — July 28, 2026

## Product decisions

- Settings is for client account and workspace identity only.
- Integrations owns Ellie CRM configuration, external CRM connections, Eventbrite, Gmail, and other connected applications.
- CRM is the day-to-day contact workspace.
- CRM lifecycle stages, campaign assignments, email safety, and research completeness are separate concepts.
- Campaigns have two clear goals:
  - Event campaign: promote a dated event or registration.
  - Offer / program campaign: promote a service, course, coaching program, membership, or Skool community.

## Implemented in the current working tree

- Simplified account Settings page.
- Added `/integrations/crm` for CRM pipeline and custom-field configuration.
- Added general, event, and coaching/Skool pipeline presets.
- Documented the built-in professional contact fields.
- Rebuilt Contact Details to show friendly labels and populated information only.
- Removed hard-coded `$15k` language from program campaigns.
- Added custom audiences during campaign creation.
- Verified switching from event campaigns to offer/program campaigns.
- Added Gmail OAuth start, callback, status, encrypted token storage, refresh, disconnect, inbox thread listing, and approved sending.
- Added `/integrations/gmail` for Gmail connection, inbox search, and compose/approve/send.
- Added Gmail setup status to Integrations.

## Gmail setup still required

The backend already has `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` and
`FRONTEND_URL`. It still needs:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

Local callback:

`http://localhost:5001/api/gmail/oauth/callback`

Production callback:

`https://ellie-ai-backend.onrender.com/api/gmail/oauth/callback`

The Google Cloud project must enable Gmail API and request these scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`

Use Google OAuth test users for the presentation until the production app
verification, privacy policy, and scope review are complete.

## Important architectural limitation

The current application does not yet have client authentication or tenant IDs.
CRM preferences are customizable but remain browser-workspace preferences.
Before selling the platform to multiple unrelated clients, add authentication,
workspace membership, roles, and tenant-scoped backend settings/data.

## Validation

- Frontend production build passes.
- Backend JavaScript syntax validation passes.
- CRM configuration and event-to-offer campaign switching were browser-tested.
- Live Gmail authorization cannot be tested until Google OAuth credentials are configured.
