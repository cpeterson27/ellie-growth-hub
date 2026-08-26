# Meta interaction automation completion — 2026-08-25

## Scope and outcome

Local application-side implementation and mocked verification only. No provider connection, live message, publication, production data change, environment change, commit, push, or deployment was performed.

Existing SocialConnection, Contact, SocialIdentity, SocialProviderEvent, ConversationThread/Message, CrmActivity, tracked links, RBAC, and workspace automations are reused. Nothing was moved to IntegrationConnection.

## Existing versus completed

| Area | Existing | Completed in this update |
| --- | --- | --- |
| Comments | Basic Instagram/Facebook ingestion, keyword rules, canonical identity | Feed comment filtering, source/context normalization, durable private-reply reservation and exact outbound message/history |
| Messages | Instagram DM/Messenger ingestion and 24-hour guard | Postback/referral handling, source attribution, sender validation, expiry/scope guards; non-message events cannot extend the window |
| Mentions | Not routed | Identity-bearing mentions enter CRM/inbox; identity-less mentions are context-only activity/history, never fabricated Contacts |
| Stories | Basic story-reply detection | Explicit story reply/story-mention message handling; aggregate story insight events ignored |
| Retry safety | Event uniqueness | Asset-scoped event IDs, compatible legacy receipts, activity idempotency key, one shared reply claim across both automation systems; uncertain sends require review |
| Page selection | Asset checkboxes and subscriptions | Prominent Page choice, avatars/names/linked Instagram, parent-Page requirement, selected-only credentials, paginated discovery |
| Instagram ownership | Two possible connection paths | Workspace selected-asset unique index plus preflight conflict checks; direct Instagram takes precedence for legacy dual selections; no automatic takeover |
| Authorization | Encrypted credentials, token exchange | Expiration/data-access checks, reconnect warnings, owner in-app notices on status checks, guarded manual Instagram refresh |
| Automation UI | General trigger form | Separate comment/message/mention/referral-postback/story categories and recent interaction/reply history |

Follow-up tasks, employee notifications, and assignment continue through the existing workspace workflow builder and canonical inbox; no second workflow or inbox system was added.

## Webhook fields and limits

- Instagram: comments, messages, mentions, messaging_postbacks, messaging_referral.
- Facebook Page: feed (new comments only), messages, messaging_postbacks, messaging_referrals.
- Story replies and story-mention attachments arrive as messages; no story_insights lead conversion.
- Mentions/referrals without messaging permission/context do not authorize an unsolicited reply.
- Likes, follows, views, saves, aggregate insights, read receipts, and reactions do not create leads or follower-triggered DMs.
- Required grants, app-level field configuration, review, and account eligibility still determine what Meta will actually deliver. Subscriptions report failure/unconfirmed state rather than pretending success.
- Facebook private replies use the comment private_replies endpoint; Instagram uses recipient.comment_id. Follow-up free-form messages require a qualifying inbound message within 24 hours. Private replies conservatively require a known recent comment within seven days.
- Only explicitly selected accounts are accepted for new ingestion/publishing/automation. Old CRM/history records are not deleted when an account is deselected.

Official reference used for fields/payloads: [Meta Instagram Postman collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) and [Meta subscription request](https://www.postman.com/meta/instagram/request/23987686-0223707a-7035-46a2-8015-1fdf7249278f).

## Connection reliability and remaining external prerequisites

Page discovery follows cursors at the fixed Graph host, not arbitrary next URLs. It neither activates Pages nor stores unselected Page access tokens. Selected Page tokens are retrieved on selection; the encrypted user authorization token remains necessary for subsequent explicit selection/revocation.

An Instagram account must be deselected/disconnected from its previous method before selection in the other method. Direct Instagram is recommended for Instagram-specific work. Existing dual selections route only through the direct owner; invalid/expired direct authorization does not silently fall back. Cross-workspace ambiguous webhook ownership fails closed.

Direct Instagram refresh is explicit, not a background worker. It requires an unexpired authorization at least 24 hours old, verifies returned identity/grants, and conditionally updates encrypted credentials so a concurrent disconnect cannot be undone. Facebook retains its existing exchange-at-login and reconnect flow; no invented Facebook refresh token is used.

Instagram Disconnect remains explicitly LOCAL removal. A safe official revocation endpoint for this exact login flow could not be verified from accessible primary documentation during the audit; the UI instructs the owner to remove the app in Instagram Apps and websites to revoke provider authorization. It does not claim provider-side revocation. Facebook retains its existing best-effort permission revocation. No live revocation was attempted.

Owner notices are generated when account status is checked; this update does not start an unattended health/refresh worker or send notification email. Connected Accounts also shows an immediate seven-day warning/reconnect notice.

Before production activation:
1. Read-only audit existing selected assets for duplicate ownership within a workspace.
2. Review/create the new unique indexes under a separately approved deployment/database plan:
   - SocialConnection: workspaceId + selectedAssetIds, partial nonempty selection, name workspace_selected_social_asset.
   - CrmActivity: workspaceId + metadata.socialEventKey, partial string key.
3. Resolve any legacy dual selections deliberately before building the ownership index. Do not drop existing indexes.
4. Re-save selected assets only with approval: this provisions expanded subscriptions and prunes stored unselected Page tokens.
5. Verify Meta grants/app-level subscriptions externally when approved. No live verification is included here.
6. Keep both outbound flags disabled until separately approved.

Concurrent ownership protection requires the new unique index to be present. The local/mock tests verify index definitions and conflict handling, not an actual production index build.

## Validation

Passed backend scripts:
- test-meta-interactions.js
- test-social-lead-automation.js
- test-meta-oauth-architecture.js
- test-meta-preconnection.js
- test-social-conversations.js
- test-social-publishing.js
- test-social-workspace.js
- test-social-oauth-security.js
- test-automation-analytics.js
- test-security-rbac.js
- test-multi-role-capabilities.js

Passed frontend checks:
- test-social-connected-accounts.js (actual component server rendering with fixtures)
- test-social-automation-ui.js
- test-social-workspace-ui.js
- test-social-publishing-ui.js
- test-automation-analytics-ui.js
- ESLint
- production Vite build

New tests cover canonical DEAL comment contacts, duplicate and legacy delivery, inbound messages/inbox, mentions with/without identity, postbacks, referral context, story replies, unsupported follower/insights events, selected-only Page credentials, pagination, ownership/isolation, expiration, guarded refresh and owner notices. Provider HTTP is mocked.

No real MongoDB integration/index-creation test or live Meta test was performed. Frontend verification is component rendering/contracts/build, not a real-account browser session.

## Safety

No application/deployment environment file was changed. SOCIAL_PUBLISHING_ENABLED and META_AUTOMATIC_REPLIES_ENABLED were not enabled in the application or production. The reply unit test temporarily sets the flag in its isolated Node process solely to exercise a mocked adapter, then resets it; this does not change runtime configuration or contact Meta.

## Exact files changed

- backend/models/CrmActivity.js
- backend/models/InAppNotification.js
- backend/models/SocialAutomation.js
- backend/models/SocialConnection.js
- backend/models/SocialProviderEvent.js
- backend/routes/social.js
- backend/routes/socialAutomation.js
- backend/routes/webhooks.js
- backend/services/automationEngineService.js
- backend/services/conversations/conversationIngestionService.js
- backend/services/conversations/metaMessagingAdapter.js
- backend/services/socialLeadAutomationService.js
- backend/services/socialOAuthService.js
- backend/services/socialPublishingService.js
- backend/test-automation-analytics.js
- backend/test-meta-oauth-architecture.js
- backend/test-meta-preconnection.js
- backend/test-social-lead-automation.js
- frontend/src/components/SocialConnectedAccounts.css
- frontend/src/components/SocialConnectedAccounts.jsx
- frontend/src/components/socialConnectionPresentation.js
- frontend/src/pages/SocialAutomation.jsx
- frontend/src/pages/SocialWorkspace.jsx
- frontend/src/services/api.js
- frontend/test-social-automation-ui.js
- frontend/test-social-connected-accounts.js
- backend/services/metaAutomationReplyService.js
- backend/services/metaEventNormalizer.js
- backend/services/socialConnectionHealth.js
- backend/test-meta-interactions.js
- docs/meta-interaction-automations.md (this report)
