# Usability update — local verification

## Result and remaining blocker

Shared onboarding identity, Social Leads, and manual-posting UX are implemented and locally tested. The reported authenticated localhost CRM failure is **not diagnosed or fixed**: navigating the real local application to `/crm/contacts` showed sign-in, not the reported failure. No speculative CRM changes were made. Sign into the local application and reproduce the failure to allow inspection of its actual runtime/API response. Do not share credentials.

The real Contacts component renders with populated and empty mocked responses without console errors. This is not proof that the authenticated local backend/session works.

## Identity and onboarding

- Reuse existing canonical User `firstName`, `lastName`, `name`, `email`, and `phone`; no schema or duplicate identity model.
- Shared First name, Last name, Email (required), and Phone (optional) fields in Team, Coach, Ambassador-via-Team, and invitation activation. Role-specific controls follow identity.
- Compose legacy `name` from structured names; legacy name-only callers remain supported.
- Reuse existing users and memberships. Preserve established identity/phone rather than overwrite them on invitation; only fill missing fields for an existing same-workspace member. An invitation into a different workspace does not alter that user's global identity. The recipient can supply their own details during activation.
- Coach/Ambassador display names reuse canonical user identity. Existing tokens, review/send invitation flow, role checks, membership activation and profile linkage remain in use.

## Social Leads

Dedicated `/social-leads` page and Social → Leads section, distinct from automation rules and content. Summaries, platform/interaction/status/assignee/date filters, canonical Contact links, conversation links, source context, latest conversation preview, assignment and empty states.

Read-only backend projection reuses SocialIdentity, SocialProviderEvent, canonical Contact and ConversationThread. Every query/join is workspace-scoped; orphan/foreign Contacts are excluded. Filters and summaries cover the latest bounded 250 identities, not a new reporting engine. Status updates use existing CRM; follow-up uses the existing conversation. No new assignment/status mutation system or follower-DM support.

## Manual posting

Social → Create post → select available connected destination → write caption → optionally attach supported image → preview → Save draft → review in Content → existing request/approve workflow → Publish now or Schedule.

Manual draft creation requires no AI. AI assistance remains optional. Publishing-disabled notice does not hide drafting. Publish/Schedule/Retry require the existing server publishing flag and valid selected assets/media. Existing backend approval, ownership, duplicate-account protection and publishing queue remain authoritative. A functioning provider authorization, approved content, enabled publishing configuration and existing worker processing are necessary for live publication; none was activated here.

## Verification

Passed backend: `test-person-onboarding-identity.js`, `test-social-lead-inbox.js`, `test-coach-onboarding.js`, `test-ambassador-onboarding.js`, `test-team-owner-invitations.js`, `test-security-rbac.js`, `test-workspace-isolation.js`, `test-social-publishing.js`, `test-crm-core.js`; syntax checks for all changed backend routes/services.

Passed frontend: `test-usability-blockers.js`, `test-team-access-ui.js`, `test-invitation-management-ui.js`, `test-social-workspace-ui.js`, `test-social-publishing-ui.js`, `test-social-automation-ui.js`, `test-coaching-role-ui.js`; ESLint; production build (472 modules); git diff whitespace check.

Browser skill used with an isolated local Axios-fixture harness rendering actual components. Checked 1280, 768 and 375px widths: Team/ambassador form, Coach dialog, CRM populated/empty, Social Leads populated/empty, Studio and Content had no horizontal overflow. No browser console errors observed. Manual draft saved without AI; disabled publishing stayed disabled; enabled fixture invoked existing schedule handler and displayed scheduled state. All mutations in this harness were in memory, not database/provider operations.

## Exact files

Modified in this update:

- backend/routes/auth.js
- backend/routes/coaching.js
- backend/routes/socialAutomation.js
- backend/routes/workspace.js
- backend/services/workspaceMemberService.js
- frontend/src/App.jsx
- frontend/src/components/Sidebar.jsx
- frontend/src/components/TeamAccess.jsx
- frontend/src/pages/AcceptInvitation.jsx
- frontend/src/pages/CoachingAdmin.jsx
- frontend/src/pages/Content.css
- frontend/src/pages/Content.jsx
- frontend/src/pages/SocialAutomation.jsx
- frontend/src/pages/SocialStudio.jsx
- frontend/src/pages/SocialWorkspace.jsx

Created:

- backend/services/socialLeadInboxService.js
- backend/test-person-onboarding-identity.js
- backend/test-social-lead-inbox.js
- frontend/src/components/PersonIdentityFields.css
- frontend/src/components/PersonIdentityFields.jsx
- frontend/src/pages/SocialLeads.css
- frontend/src/pages/SocialLeads.jsx
- frontend/src/pages/socialLeadPresentation.js
- frontend/src/utils/personIdentity.js
- frontend/src/utils/socialPublishingReadiness.js
- frontend/test-usability-blockers.js
- frontend/test-usability-preview.mjs
- docs/usability-blockers-report.md

Preserved prior uncommitted Team layout work in TeamAccess.jsx, TeamAccess.css and test-team-access-layout.js. TeamAccess.jsx additionally changed for this update; the other two were not edited by this update.

## Inspect

- `/settings/team` — Add person, including Ambassador
- `/coaching/coaches` — Add Coach
- `/crm/contacts` — remaining authenticated reproduction required
- `/social-leads` or `/social/leads`
- `/social-automation`
- `/social/create`
- `/social/content`

No commit, push, deployment, production writes, live provider calls, messages, or posts. SOCIAL_PUBLISHING_ENABLED and META_AUTOMATIC_REPLIES_ENABLED were not changed.
