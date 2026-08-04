# Current build status — July 28, 2026

## Organization Discovery professional monitoring upgrade — August 4, 2026

- Five separate interface tabs distinguish company discovery, intent monitoring, live lead review, people research, and saved searches.
- The August 22 nationwide online-event preset groups editable phrases into career transition, business ownership, growth and systems, and real-estate wealth intent.
- Every source reports its last success, last error, cumulative results, blocked or rate-limited state, next attempt, and individual enabled state.
- Monitoring activity records source checks, candidates, rejected weak matches, website research, prepared leads, failures, and completion.
- Database-backed leases provide restart recovery and duplicate-run prevention across backend instances.
- OpenAI classification is optional. Rules-based classification remains the automatic fallback.
- In-app notifications cover high scores, published emails, completion, source failures, and qualified leads.
- Identity and company affiliation remain unresolved unless public evidence supports them. CRM addition is one lead at a time, outreach is never automatic, and published emails remain unverified.
- Live Leads now acts as a plain-language adult-buyer decision queue. Explicit minors, school assignments, hypothetical questions, job seekers, promotions, and no-budget posts are rejected before review; existing ineligible signals are dismissed when the queue reloads.
- Monitoring setup, source health, and technical activity are progressively disclosed so the primary screen explains what is running, what will happen next, and what—if anything—the user needs to do.
- Buyer-intent scoring now requires a specific first-person need, current business challenge, recommendation request, or concrete start/buy/scale/invest goal. Generic advice, free resources, creator feedback requests, and promotions are rejected; usernames and repeated keywords no longer inflate scores.
- Live Lead actions use explicit outcomes: saving a possible lead changes review status only, while CRM creation remains a separate confirmed action. Source accounts are clickable public usernames and are explicitly not presented as verified real identities.
- CRM import review now lives under People Research, where staged research imports originate. Source retry notices are grouped and translated into non-actionable informational messages, and the notification panel has a persistent close control.
- Saved possible leads can generate editable, personalized event-email drafts directly from public evidence. Generation requires and preserves both the campaign's Eventbrite and Meetup links. Drafts remain unsent; transferring a reviewed draft into Outreach requires a researched CRM contact and verified email, and the transferred message still enters as pending review.
- Public usernames cannot be used as CRM names. A real researched name is required before an intent signal becomes a contact.
- Approving an intent lead now opens the unsent Deal to Close draft as the immediate next action. Each saved lead shows a five-step progress path: intent approved, email drafted, identity added, email verified, and ready in Outreach.
- Intent-created CRM records use a guided action center instead of treating missing fields as a generic data-quality form. It links back to the original evidence and generated draft, starts evidence-bounded Jarvis identity research, and explains that no outreach has been sent.
- Legacy intent contacts that stored a Reddit username or URL as a person's name are safely relabeled as “Identity research needed”; the original account value is retained in notes as evidence.
- “Research identity with Jarvis” now opens a dedicated lead-research task and starts it automatically. The task keeps the original post attached, returns to the exact lead, and distinguishes a supported real name or published contact from the honest outcome that only a manual public-platform reply/message is available.
- Jarvis identity tasks now show elapsed time, a normal 1–3 minute expectation, explicit completion/failure states, and an always-visible result transcript. Findings speak automatically; when OpenAI speech is unavailable or out of credits, Jarvis uses the device's built-in browser voice and automatically returns to the selected OpenAI voice when service is available again.
- If paid OpenAI web research is unavailable, exact public-account searches fall back to Growth Operator's Bing, Reddit, Bluesky, Hacker News, Stack Exchange, and DuckDuckGo adapters. Matching links are presented as clues for manual evidence review and never treated as proof that two usernames belong to the same person.

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
- Added invitation-only user accounts, server-side sessions, secure cookies, CSRF
  protection, workspace memberships, and owner/admin/member/viewer roles.
- Protected application API routes and added a login screen. There is no public
  signup endpoint.

## Authentication setup

Create the first owner deliberately from the backend directory:

`npm run create-owner -- owner@example.com "Owner Name"`

The command prompts for the password without displaying or storing it in shell
history. Then open `/login` in the frontend and sign in with that email and
password.

The current release supports one locked workspace. Do not provision unrelated
client workspaces yet: all existing business records still need `workspaceId`
backfill and query-level tenant enforcement before multi-client use.

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

## Deal to Close send-readiness audit

- The database contains 45 pending Deal to Close drafts and 2 sent records.
- The campaign record still contains the legacy placeholder subject and body.
- The CRM contains 100 CSV-imported contacts and one manual contact.
- No contacts currently have recorded marketing consent or topic subscriptions.
- Resend currently prohibits unsolicited or cold outreach and requires explicit
  opt-in. Do not send the 45-message batch until the consent source is confirmed
  and recorded.

## Validation

- Frontend production build passes.
- Backend JavaScript syntax validation passes.
- CRM configuration and event-to-offer campaign switching were browser-tested.
- Live Gmail authorization cannot be tested until Google OAuth credentials are configured.
