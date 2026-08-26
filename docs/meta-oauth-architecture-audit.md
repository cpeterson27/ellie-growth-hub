# Meta / Instagram OAuth architecture correction

Local-only audit and implementation, 2026-08-25. No provider requests, activation, deployment, commits or environment changes.

## Findings

- The CURRENT OAuth service and route registries already contained linkedin, meta, instagram and x. The quoted two-provider registry was not present locally. This audit cannot establish what version is deployed.
- meta and instagram are separate authorization products, not interchangeable credentials. SocialConnection already has both provider values and a unique workspaceId + provider index. No migration or additional credential collection is needed.
- Facebook authorization lacked FACEBOOK_LOGIN_CONFIG_ID and used the old scope-based login URL.
- Instagram already had authorization, short/long-lived exchange, identity/permissions verification, assets, publishing host selection, messaging host selection and separately signed webhooks. It was reachable through Social > Connected Accounts.
- The older Integrations catalog/UI still treated Facebook and Instagram as one entry and did not load direct Instagram connection state.
- Scope parsing accepted concatenated/unknown permission names. Publishing silently defaulted to v23.0 while OAuth required an environment version.

## Audited paths

- backend/routes/social.js — starts, callbacks, status, selection and disconnect; owner/admin mutation gates.
- backend/services/socialOAuthService.js — signed workspace/user state, membership revalidation, provider exchanges, encryption, assets and subscriptions.
- backend/models/SocialConnection.js — encrypted credentials excluded from normal queries, workspace/provider unique index.
- backend/services/integrations/providerCatalog.js and index.js — catalog plus older generic provider adapters. Generic adapters are not the SocialConnection OAuth system and were not given another credential store.
- backend/services/socialPublishingService.js — Page/Instagram scopes, selected assets and provider-specific Graph host.
- backend/services/conversations/metaMessagingAdapter.js — message host, signature verification, window/recipient/workspace checks.
- backend/routes/webhooks.js and backend/server.js — distinct meta/instagram paths, raw-body signatures, secret selection and workspace context.
- frontend/src/pages/SocialWorkspace.jsx, components/SocialConnectedAccounts.jsx, services/api.js — Facebook starts meta; Instagram starts instagram.
- frontend/src/pages/Integrations.jsx — older settings screen now includes direct Instagram.
- OAuth, preconnection, Social workspace, publishing, conversation, and frontend Social tests.

## Chosen architecture

Connect Facebook -> meta -> Facebook Login for Business -> Facebook user/Page tokens -> graph.facebook.com.

Connect Instagram -> instagram -> Business Login for Instagram -> Instagram user token -> graph.instagram.com.

Keep previously authorized Page-linked Instagram assets under meta for backward compatibility. Do not copy tokens or clone records when viewing or selecting assets. Each explicitly connected login product retains its own existing workspace/provider record.

The two products have different scope vocabularies. See Meta's official collection:
https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
and its insights requirements:
https://www.postman.com/meta/instagram/folder/23987686-f659d7d1-d74c-44e4-9192-9b1e8694c511

Direct retrieval of the Facebook Login for Business developer page was rate-limited (429); dashboard settings and real-account acceptance are not verified by this local pass:
https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/

## Changes

- Shared immutable provider list consumed by service, routes and model; existing enum values unchanged.
- Facebook requires a nonblank numeric FACEBOOK_LOGIN_CONFIG_ID. Authorization URL sends config_id, response_type=code and override_default_response_type=true, not scope.
- META_OAUTH_SCOPES is no longer an authorization input. If left in the environment, it is validated against supported permissions and rejected if malformed. Remove this obsolete variable to avoid confusion; choose Facebook permissions in the dashboard configuration.
- Instagram retains its existing four default scopes: instagram_business_basic, instagram_business_manage_comments, instagram_business_manage_messages, instagram_business_content_publish. An explicit override is validated/deduplicated. Empty, concatenated, cross-product and unsupported names fail before contacting a provider. Insights is recognized as an optional valid scope but is NOT added by default; insights sync is not implemented.
- Shared Graph version validation is used by OAuth/subscriptions, publishing and messaging. No silent version fallback. Unversioned Instagram token exchange URLs intentionally remain unversioned.
- Redirect URLs require the correct callback path and HTTPS (HTTP localhost is allowed for development).
- State rejects extra segments, unknown providers and invalid expiry. Callback still rechecks active owner/admin membership, and only the signed workspace/user determines storage.
- Facebook verified-token identity must match profile discovery.
- Catalog and older Integrations UI now expose distinct Facebook and Instagram connections through the same existing SocialConnection APIs.

## Exact authorization URL structures

Values are URL-encoded at runtime; placeholders below are not literal values.

Facebook:
https://www.facebook.com/v26.0/dialog/oauth?client_id=<META_APP_ID>&redirect_uri=<META_REDIRECT_URI>&state=<signed-state>&response_type=code&override_default_response_type=true&config_id=<FACEBOOK_LOGIN_CONFIG_ID>

Instagram:
https://www.instagram.com/oauth/authorize?client_id=<INSTAGRAM_APP_ID>&redirect_uri=<INSTAGRAM_REDIRECT_URI>&state=<signed-state>&response_type=code&scope=<validated-comma-separated-instagram-business-scopes>&enable_fb_login=0

No app secrets appear in either browser URL.

## Render configuration to verify manually

Facebook:
- META_APP_ID / META_APP_SECRET — the Facebook app credentials.
- FACEBOOK_LOGIN_CONFIG_ID — use the configuration ID already supplied in Render; it is now consumed.
- META_REDIRECT_URI=https://ellie-ai-backend.onrender.com/api/social/meta/oauth/callback
- META_WEBHOOK_VERIFY_TOKEN — existing Facebook webhook verifier.

Instagram:
- INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET — credentials shown for the Instagram Login product, not assumed interchangeable with Facebook credentials.
- INSTAGRAM_REDIRECT_URI=https://ellie-ai-backend.onrender.com/api/social/instagram/oauth/callback
- INSTAGRAM_WEBHOOK_VERIFY_TOKEN — Instagram webhook verifier.
- INSTAGRAM_OAUTH_SCOPES — optional; omit to use the existing four defaults, or use only needed supported scopes.

Shared:
- META_GRAPH_API_VERSION=v26.0
- INTEGRATION_CREDENTIAL_ENCRYPTION_KEY — preserve the existing key.
- FRONTEND_URL=https://elliescoaching.com — existing callback return goes to /integrations.
- SOCIAL_PUBLISHING_ENABLED=false
- META_AUTOMATIC_REPLIES_ENABLED=false

Do not rotate existing secrets/keys merely for this change. No environment values were inspected or changed by this task.

## Manual Meta dashboard checklist

1. Confirm the supplied Facebook configuration belongs to META_APP_ID and is Facebook Login for Business, not an unrelated embedded-signup flow.
2. Configure a user-access-token login compatible with existing /me and /me/accounts discovery. A business system-user-token workflow is not implemented.
3. Select only permissions needed for Page discovery, Page webhooks and the intended enabled features. Page publishing requires pages_manage_posts; Messenger requires pages_messaging; engagement actions require their corresponding grants. Include legacy Instagram permissions only if intentionally using Page-linked Instagram.
4. Register the exact Facebook and Instagram redirect URLs above in their respective products.
5. Configure Facebook webhook URL https://ellie-ai-backend.onrender.com/api/webhooks/meta and Instagram webhook URL https://ellie-ai-backend.onrender.com/api/webhooks/instagram with their matching verify tokens. Enable supported Page feed/messages/messaging_postbacks and Instagram comments/messages fields for intended features.
6. Confirm Ellie has the appropriate development/test role and account permissions. Non-test customer access may require Advanced Access/App Review. This code change does not grant approval.
7. Keep workers/replies disabled. A future explicitly approved connection test remains necessary.

## Remaining limitations (not claimed fixed)

- Instagram disconnect clears local credentials/assets and prevents further processing but does not revoke authorization at Instagram; removal can be done in Instagram's app permissions. Existing Facebook disconnect attempts remote revocation and always clears local credentials.
- Page discovery currently reads the first returned page of assets. Token refresh, durable single-use OAuth nonce storage, and insights synchronization are not implemented by this correction.
- If the same Instagram asset is intentionally authorized through both login products, existing outbound selection can be ambiguous. Prefer one selected authorization path per Instagram asset; no automatic token copying, re-linking, or account merging was introduced.

## Files changed in this task

- backend/services/socialProviderConfig.js (new)
- backend/services/socialOAuthService.js
- backend/routes/social.js
- backend/models/SocialConnection.js
- backend/services/socialPublishingService.js
- backend/services/conversations/metaMessagingAdapter.js
- backend/services/integrations/providerCatalog.js
- frontend/src/pages/Integrations.jsx
- backend/test-meta-oauth-architecture.js (new)
- backend/test-meta-preconnection.js
- docs/meta-oauth-architecture-audit.md (new)

Existing uncommitted profile and Connected Accounts changes were preserved.

## Validation

Mocked backend: test-meta-oauth-architecture.js, test-meta-preconnection.js, test-social-oauth-security.js, test-social-workspace.js, test-social-publishing.js, test-social-conversations.js.
Frontend: test-social-connected-accounts.js, test-social-workspace-ui.js, test-social-automation-ui.js, test-social-publishing-ui.js; ESLint and production build.
No live OAuth, webhook subscription, publishing, messaging or database operations were performed.
