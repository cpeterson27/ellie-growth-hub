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

Provider-specific connect buttons must remain disabled and labeled planned until
the provider application is approved, the real API calls exist, token refresh is
tested, and workspace isolation is enforced for all integration records.

## Current connection status

- **Eventbrite**: active event connection and registration source of truth.
- **Gmail**: active customer authorization for permitted inbox operations.
- **Resend**: platform-managed campaign delivery.
- **CSV**: active vendor-neutral contact import.
- **Meetup**: public community discovery only; no key is required. Authenticated
  Meetup Pro management is not implemented.
- **LinkedIn**: customer OAuth is planned. It is not a people-search connection.
- **Facebook and Instagram**: customer OAuth is planned. It is not a private
  group-member connection.
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
