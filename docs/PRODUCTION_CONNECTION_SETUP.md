# Production connection setup

This guide separates required account setup from optional paid lead acquisition. Connecting a social account does **not** authorize Growth Operator to scrape arbitrary people, Facebook Groups, or LinkedIn Groups. It lets an approved user grant limited access to assets they administer, such as a Facebook Page, Instagram business account, LinkedIn Page, or approved lead-generation product.

## The eight setup tasks

1. **Keep the production frontend and backend URLs.** Use the public HTTPS addresses for the deployed app. Cost: no additional provider fee; these are part of the existing hosting/domain.
2. **Create a Meta developer app.** Use a real company-owned Meta Business portfolio and app, not a contractor's personal app. Cost: creating the app normally has no separate fee. Advertising spend is optional and separate.
3. **Add the Meta production callback.** Add `https://<backend-host>/api/social/meta/oauth/callback` exactly. Put the app ID and secret in the backend host's secret environment, never the frontend.
4. **Request only the Meta permissions the product uses.** Start with Page listing and engagement permissions. Add Instagram or lead-form permissions only when that feature exists and can be demonstrated. Provider review/business verification may require company documents but is not itself an ad purchase.
5. **Create a LinkedIn developer app attached to the company LinkedIn Page.** A Page super-admin must verify it. Cost: LinkedIn does not document a separate app-creation charge; approval, not payment, is the main constraint.
6. **Add the LinkedIn production callback.** Add `https://<backend-host>/api/social/linkedin/oauth/callback` exactly. Store the client ID and secret in backend secrets.
7. **Request the LinkedIn product that matches the feature.** Basic OpenID identifies the connecting member. Community Management is for Page management/analytics. Lead Sync is for leads submitted through LinkedIn lead-generation forms. These products do not provide a general people or Groups search API. Development access is limited and Standard access requires review and a working demonstration.
8. **Complete legal/review material and test with non-owner accounts.** Publish privacy policy and terms pages, explain deletion/disconnection, record the provider-review screencast, and test two separate workspaces before onboarding a client. Cost: no mandatory software fee if you prepare this yourself; legal review is optional but sensible before selling access.

## Environment values

```text
FRONTEND_URL=https://<frontend-host>
PUBLIC_BACKEND_URL=https://<backend-host>
INTEGRATION_CREDENTIAL_ENCRYPTION_KEY=<32-byte base64 secret>
TENANT_QUERY_ENFORCEMENT=enabled

META_APP_ID=<from Meta>
META_APP_SECRET=<from Meta>
META_REDIRECT_URI=https://<backend-host>/api/social/meta/oauth/callback
META_GRAPH_API_VERSION=<currently supported version>
META_OAUTH_SCOPES=pages_show_list pages_read_engagement

LINKEDIN_CLIENT_ID=<from LinkedIn>
LINKEDIN_CLIENT_SECRET=<from LinkedIn>
LINKEDIN_REDIRECT_URI=https://<backend-host>/api/social/linkedin/oauth/callback
LINKEDIN_OAUTH_SCOPES=openid profile email
LINKEDIN_API_VERSION=<currently supported marketing version when approved>
```

Do not invent access tokens or paste them into committed `.env` files. Customers connect through the Integrations screen; Growth Operator stores the resulting credentials encrypted and scoped to their workspace.

## What can cost money

- Existing hosting, database, domain, email delivery, and OpenAI usage can have usage charges.
- Meta/LinkedIn ads are optional paid acquisition channels.
- Lead databases such as Apollo are optional subscriptions. They are not required for public-web research, but public search cannot reliably provide private emails or arbitrary social-network membership.
- Google Programmable Search/API usage and other search providers have their own quotas and pricing. Keep search-provider work separate from social OAuth.
- Legal help for privacy/terms/provider review is optional but recommended before client launch.

## Safe tenant migration and rollback

Run `npm run tenant:audit` first. It is read-only and refuses automatic attribution when more than one workspace exists. `npm run tenant:migrate` writes a private rollback manifest before changing records and verifies that none remain unassigned. Then run `npm run tenant:indexes:audit` followed by `npm run tenant:indexes:migrate`. Never run an apply command for a multi-workspace database until legacy records have been attributed to the correct workspace.

The production database was migrated on 2026-08-15: 928 records were assigned to the sole Ellie workspace (923 legacy records plus 5 audience records), zero remained unassigned, and 14 global unique indexes were replaced with per-workspace unique indexes.
