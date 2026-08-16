# Leads and social connections

## Product truth

Growth Operator is the system of record for events, contacts, campaign assignment,
reviewed outreach, and registrations. It does not treat every discovered URL as a
person lead.

Discovery results are separated into four opportunity types:

- **Person**: a named person supported by public evidence. This can move through
  email verification, CRM approval, campaign assignment, and reviewed outreach.
- **Community partner**: a group, association, Meetup, newsletter, or community.
  The next step is to identify its organizer and request a partnership. Growth
  Operator does not scrape or export members.
- **Organization**: a business or other entity. The next step is to identify a
  relevant owner or decision-maker.
- **Intent signal**: a public post or discussion that may indicate need. The next
  step is identity research; a username alone is not a verified person.

The Live Leads count is an opportunity inbox, not a count of contactable people.
The UI reports how many records are named people, communities, organizations,
intent signals, or still need identity research.

## Social platform role

Social connections are distribution and inbound-lead integrations. They are not
general people databases.

An approved customer-owned connection may eventually support:

- publishing approved content to assets the customer administers;
- reading comments, reactions, and permitted analytics;
- synchronizing leads submitted through the customer's own lead forms;
- reading permitted advertising performance; and
- disconnecting or reauthorizing the customer's account.

It must not promise private group access, group-member export, unrestricted people
search, or automated personal messaging.

## Professional customer OAuth requirements

Do not store customer access tokens in environment variables. Environment values
hold only the Growth Operator application's provider client ID, client secret, and
redirect URI. Each customer's authorization must be:

1. initiated by an authenticated workspace owner or admin;
2. protected with state and PKCE where the provider supports it;
3. exchanged server-side;
4. encrypted at rest and scoped to that workspace and provider;
5. recorded with granted scopes, provider account and asset IDs, expiry, and
   refresh status;
6. excluded from every browser response, log, and audit payload;
7. verified against the real provider API before status becomes `connected`; and
8. revocable by the customer, including provider-side token revocation when
   supported.

Provider-specific connect buttons remain disabled until their application
credentials are configured. Once configured, the connection flow stores each
workspace's authorization in the dedicated `SocialConnection` collection and
never uses shared customer tokens from environment variables.

## Implemented social OAuth lifecycle

Growth Operator now provides these workspace-scoped routes for `linkedin` and
`meta`:

- `GET /api/social/:provider/oauth/status`
- `GET /api/social/:provider/oauth/start`
- `GET /api/social/:provider/oauth/callback`
- `PATCH /api/social/:provider/assets`
- `POST /api/social/:provider/oauth/disconnect`

Starting, selecting assets, and disconnecting require an owner or administrator.
The callback uses a signed ten-minute state value tied to the initiating user,
workspace, and provider. Completion rechecks that the initiating user still has
an active owner/admin membership. Tokens and Meta Page tokens are encrypted with
AES-256-GCM. The API returns connection metadata and asset names but never token
material.

LinkedIn verifies the member using OpenID Connect and, when a supported LinkedIn
API version and approved Community Management access are configured, requests
the organizations the member administers. Meta verifies the member, retrieves
authorized Facebook Pages, and discovers connected Instagram business accounts.
The customer explicitly selects which returned assets Growth Operator may use.

The first production release intentionally limits this work to secure connection
and asset selection. Publishing, lead-form synchronization, comments, analytics,
and ads must each be added as separately reviewed capabilities after the relevant
provider permissions are approved. The UI must not claim those operations are
active before real provider calls and tests exist.

## Provider application setup

LinkedIn production environment values:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI` (exact production HTTPS callback)
- `LINKEDIN_OAUTH_SCOPES` (only approved scopes)
- `LINKEDIN_API_VERSION` (a currently supported Marketing API version)

Meta production environment values:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` (exact production HTTPS callback)
- `META_GRAPH_API_VERSION` (the version selected for the reviewed app)
- `META_OAUTH_SCOPES` (only approved scopes)

Both providers also require `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`. Never rotate
that key without a credential migration because existing encrypted connections
would become unreadable.

## Current connection status

- **Eventbrite**: active event connection and registration source of truth.
- **Gmail**: active customer authorization for permitted inbox operations.
- **Resend**: platform-managed campaign delivery.
- **CSV**: active vendor-neutral contact import.
- **Meetup**: public community discovery only; no key is required. Authenticated
  Meetup Pro management is not implemented.
- **LinkedIn**: workspace-scoped customer OAuth and organization selection are
  implemented but remain unavailable until the LinkedIn developer application,
  approved scopes, API version, and production callback are configured.
- **Facebook and Instagram**: workspace-scoped Meta OAuth and Page/business-account
  selection are implemented but remain unavailable until the Meta developer
  application, approved scopes, Graph API version, and callback are configured.
- **X**: not an active publishing or lead-discovery integration.

The legacy social adapters must fail closed. They must never return invented post
IDs, URLs, or successful authentication responses.

## Operating workflow

1. Start with warm contacts, referrals, prior attendees, and customer-owned lists.
2. Review the People queue for direct prospects.
3. Review Communities for organizer and partnership outreach.
4. Review Organizations for a named decision-maker.
5. Review Intent signals only when public evidence supports a current need.
6. Verify contact information before campaign use.
7. Assign a contact to a campaign intentionally.
8. Review every first outreach message before sending.
9. Stop follow-up after registration, reply, unsubscribe, or disqualification.
10. Attribute registrations to the originating channel or partner.

## Remaining production gates

Before unrelated paying clients can share one deployment, complete workspace
backfill and query-level tenant enforcement across all business and integration
records. Social OAuth must not launch before that isolation work is verified.
Provider developer accounts, business verification, app review, approved scopes,
privacy disclosures, and production redirect URLs are external prerequisites and
cannot be replaced by adding blank environment variables.
