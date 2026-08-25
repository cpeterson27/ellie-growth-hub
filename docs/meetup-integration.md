# Meetup integration capability audit

Reviewed against Meetup's official OAuth 2 and GraphQL documentation on 2026-08-25.

## Product boundary

Public Meetup Discovery remains read-only public-web research. A discovery result is not an authorized asset and must never present a message, event-management, attendee-export, or network-management action.

Connected Meetup Pro uses Meetup's authorization-code OAuth flow. Growth Operator stores only encrypted OAuth tokens in the existing workspace-scoped `IntegrationConnection`; it never receives the member's password. The GraphQL endpoint is `https://api.meetup.com/gql-ext`. Meetup uses rotating, single-use refresh tokens, so each refresh atomically replaces the encrypted refresh token.

## Current official capability classification

### A — officially exposed now

- Verify the authorized member with `self`.
- Read an event and its basic RSVP/member data when the authorization permits it.
- Create draft events with `createEvent` and update/publish events with `editEvent`.
- Search/read groups and events exposed by the authorized GraphQL schema.

### B — Meetup Pro only

- Creating an OAuth consumer and production API access.
- `proNetwork` group/event search, network analytics and registration-answer data.
- Attendee email, only when the member RSVP'd to a Pro-network event and chose to share it. Growth Operator treats an absent email as unavailable and does not infer or enrich one.

### C — ownership/authorization dependent

- Creating, editing, deleting, publishing, or announcing events.
- Managing groups or a Pro network.
- Reading non-public RSVP/registration data and consented attendee email.
- Organizer/network communications. These can target only assets the connected member is authorized to manage.

### D — not an API capability

- Arbitrary private messages to members, organizers, discovered communities, or scraped audiences.
- Password access, private profile export, or fields omitted by Meetup's schema.
- Email access for members who have not consented to Pro email sharing.
- Treating public discovery as permission to contact or manage the target.

Meetup documents event announcements as supported, but the exact mutation/input must be confirmed by introspecting the connected account's current schema. Growth Operator may queue an `announce_event` approval request, but it intentionally cannot execute that request until that schema is verified and implemented.

## Safety and activation

- Owner/Admin only: connect, disconnect, read assets/RSVPs, select groups, request or approve provider mutations.
- Every automation mutation becomes a `MeetupActionRequest`; it never bypasses human approval.
- `MEETUP_OUTBOUND_ENABLED` defaults off. Approval records the decision but makes no provider mutation while off.
- Provider mutations and successful outcomes are recorded in the existing `CrmActivity` timeline with idempotency keys.
- RSVP data is never automatically imported. An Owner/Admin may explicitly synchronize an event; only Meetup-returned email is used, the workspace email uniqueness constraint reuses the canonical Contact, provider deliveries are idempotent, and no marketing consent is inferred.

## Configuration

- `MEETUP_CLIENT_ID`
- `MEETUP_CLIENT_SECRET`
- `MEETUP_REDIRECT_URI`
- `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` (existing)
- `MEETUP_OUTBOUND_ENABLED=false` initially

Production callback: `https://ellie-ai-backend.onrender.com/api/meetup/oauth/callback` (confirm the actual Render backend hostname before registering the consumer).

No webhook URL is defined because Meetup's official current documentation reviewed here does not establish a general webhook product for these operations. Synchronization should be explicit or scheduled polling within documented rate limits (500 points per 60 seconds), with idempotent CRM ingestion.

Official references: Meetup GraphQL introduction and guide, OAuth 2 server flow, Meetup Help articles on API access/limitations, OAuth versus JWT, Pro attendee-email access, and Pro-expiration behavior.
