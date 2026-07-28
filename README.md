# Ellie AI Growth Operator

Ellie AI Growth Operator is a private event-marketing workspace that combines
contact management, audience discovery, campaign planning, email outreach,
Eventbrite operations, and an AI assistant in one application.

It is designed to help a small team move from an event idea to a measurable
campaign without maintaining separate spreadsheets, disconnected contact lists,
and manual outreach records.

## What the product does

Ellie AI organizes the work surrounding an event:

- Manage events and connect each event to its marketing campaign.
- Import contacts from CSV and preserve incomplete records for later research.
- Verify email addresses before they are used for outreach.
- Find and review prospects before approving them as contacts.
- Assign one or many contacts to a campaign.
- Generate, review, approve, and send personalized outreach.
- Track campaign activity, replies, registrations, attendees, and event results.
- Use Jarvis to summarize workspace information and help plan next actions.

The system uses MongoDB as its primary operational database. External services
such as Eventbrite, Emailable, Resend, Apollo, OpenAI, and the Jarvis memory
bridge contribute specialized capabilities, but Ellie AI remains the central
workspace.

## How the main workflow fits together

### 1. Events

An event represents the actual experience being promoted: its name, date,
location, price, audience, ticket goal, and registration details.

An event and a campaign are related, but they are not the same:

- **Event:** what people register for and attend.
- **Campaign:** the marketing effort used to reach the right people.

An event should have only one matching campaign for the same promotion unless
the team intentionally creates separate campaigns for different audiences or
offers. When a campaign already exists, Ellie AI should show **View Campaign**
instead of asking the user to create a duplicate.

### 2. Eventbrite connection

Eventbrite is the ticketing and registration system. Ellie AI is the operating
workspace around it.

Once an Eventbrite account is authorized, Ellie AI can:

- Import an existing Eventbrite event.
- Plan a new event as an Ellie-only draft without creating anything in
  Eventbrite.
- Create an Eventbrite draft only after the required listing information is
  ready, and publish it through a separate confirmation.
- Display the summary, structured overview, organizer, media, category, format,
  venue, policy, ticket classes, purchasing rules, and online-event status that
  Eventbrite exposes through its public API.
- Update supported basic event details after showing a field-by-field change
  preview.
- Synchronize tickets, orders, attendees, check-ins, and gross sales.
- Preserve synchronization history so the team can see when data was refreshed.

**Sync Eventbrite** does not create a second event or campaign. It refreshes the
Ellie AI record with the latest information from the already-connected
Eventbrite listing.

Eventbrite's modern event description is stored as a short summary plus
versioned structured-content modules. Ellie AI retrieves and normalizes those
modules automatically. The user does not choose or increment version numbers.
Modern Eventbrite features that are not exposed through the public API, such as
some Agenda and Lineup configurations, remain in Eventbrite's authoritative
editor. Ellie AI identifies those fields clearly and provides an **Edit advanced
content on Eventbrite** link instead of presenting an incomplete editor.

Eventbrite listing data and Ellie AI campaign strategy are intentionally
separate:

- **Eventbrite listing:** description, schedule, organizer, tickets, policy,
  media, venue, and registration logistics.
- **Ellie campaign strategy:** approved target audience, channels, prospect
  filters, campaign assignment, and messaging.

For imported events, Ellie AI may suggest audience groups by finding the
event's own “Who this event is for,” “Perfect for,” or “Ideal for” section. For
new events, the planning wizard generates grounded recommendations from the
event promise, attendee outcomes, ideal-attendee notes, format, price, and
business goal. OpenAI is used when enabled; a conservative rule-based strategy
remains available when it is not. Suggestions do not become campaign filters
until a team member selects and confirms them. Imports never seed a generic
hardcoded audience.

For near-real-time updates, an Eventbrite webhook can point to
`https://<backend-host>/api/eventbrite/webhook?token=<EVENTBRITE_WEBHOOK_TOKEN>`.
This is a one-time connection step in Eventbrite's developer dashboard. The
token stays in secured backend environment settings and is never returned by a
public setup endpoint. The webhook notifies Ellie AI of an event, order,
attendee, check-in, or ticket-class change; Ellie AI then retrieves the
authoritative record with its server-side OAuth token. The webhook payload
itself is not trusted as the event record.

The private-token connection supports the original account integration. OAuth
is the professional connection method intended for a sellable, multi-client
product because each business can authorize its own Eventbrite account without
sharing credentials with the application owner.

Event images are uploaded directly from the event wizard and hosted by
Cloudinary; users never need to create or paste an image URL. The backend needs
one private `CLOUDINARY_URL` environment variable in local development and in
the Render backend service. It has the standard
`cloudinary://API_KEY:API_SECRET@CLOUD_NAME` format and must never be placed in
the frontend.

### 3. Contacts and email safety

Contacts may be entered manually or imported from a CSV. A usable name is enough
to retain the relationship, and a verified email is enough for intentional
manual campaign assignment. It is not enough for automatic audience matching.
Ellie AI labels a name-and-email-only record **Audience unknown** and waits for
a real targeting signal such as a title, company, industry, audience profile,
seniority, keyword, or list.
Ellie AI does not infer interests or profession from a person's name.
Missing company, title, industry, or email information does not cause the person
to disappear.

Email readiness is tracked separately from research completeness:

- **Verified email:** approved by the verification provider and safe for normal
  outreach.
- **Owner confirmed:** a team member personally confirmed the address; it may be
  used without purchasing another verification.
- **Risky, unknown, or undeliverable:** withheld from campaigns until reviewed or
  replaced.
- **No email:** the contact remains in the database for research, but cannot
  receive email.

Verification does not automatically send an email. Importing a contact does not
automatically add that person to a campaign.

### 4. Built-in CRM workflow

The Contacts page is Ellie AI's built-in CRM. Manual contacts, CSV imports, and
contacts synchronized from another CRM enter this page directly. They do not
need a second approval in Discovery. The CRM is organized around one clear next
action:

- **All contacts:** every active relationship in the database.
- **Needs attention:** an email must be reviewed or the contact needs real
  audience information.
- **Ready to assign:** the contact has a usable email and enough audience
  context but has not been assigned to a campaign.
- **Campaign assigned:** the contact is connected to at least one campaign.
- **Archived:** the relationship is retained for history but removed from
  active work.

CSV import is a three-step flow: choose the file, verify email addresses, and
save the contacts to the CRM. Verification does not send email, and saving does
not assign a campaign. After import, the CRM shows the next action for each
record.

A contact does not need a company, title, and industry to join a campaign. A
name plus a verified or owner-confirmed email is sufficient when the team knows
the person is a good fit.

Contacts can belong to multiple campaigns. Removing a campaign assignment should
not delete the contact or erase their history.

### 5. Discovery

Discovery is the review area for prospective people and organizations before
they enter the CRM. It is for net-new prospects found through Apollo or another
discovery source—not for CSV files or people the team already knows. Approving a
discovered prospect adds that relationship to the CRM; all later work happens
from Contacts.

Apollo organization discovery can use configurable targeting such as:

- Target profile
- Titles
- Industries
- Keywords
- Locations
- Company size

This makes it possible to search for a different audience each time rather than
locking the application to one permanent profile. Apollo People Search depends
on the connected Apollo plan and its API permissions.

Approving a discovery prospect accepts the record into the contact workflow. It
does not automatically make an unsafe email deliverable or send outreach.

### 6. Campaign assignment

Campaign assignment is an intentional audience decision. A user may select
individual contacts or choose a group of approved contacts and assign them in
bulk.

For the Deal to Close bootcamp, the intended flow is:

1. Review or import a contact.
2. Confirm that the person is relevant to the offer.
3. Confirm that the email is verified or personally confirmed.
4. Assign the contact to the Deal to Close campaign.
5. Generate the campaign outreach draft.
6. Review and approve the message.
7. Send it and track the result.

Changing the assignment later should remove the person from that campaign
without deleting the contact.

### 7. Outreach

Outreach records are saved separately from the contact so the application has an
auditable history of what was prepared and sent.

Typical states are:

- Pending review
- Approved
- Sent
- Replied
- Failed

Editing a contact after a message has already been sent does not alter the
historical sent message. A resend should create a new outreach attempt using the
contact's current email address, rather than silently changing the original
record.

Campaign email may include personalized copy, event artwork, and registration
buttons. Messages are reviewed before sending so a user can verify the
recipient, subject, body, links, and visual presentation.

### 8. Jarvis

Jarvis is the conversational interface for Ellie AI. It can read approved
workspace data and synchronized memory notes, summarize priorities, explain
campaign status, and suggest actions.

Jarvis does not independently modify source code, operate a developer computer,
or start local services. Development requests can be recorded for review, but
code changes are completed through the development workflow.

Jarvis's cloud memory is a synchronized copy of approved Obsidian notes. The
deployed application does not directly read a private local vault.

## Recommended operating rules

- Do not send to risky, unknown, undeliverable, or unsubscribed addresses.
- Allow owner-confirmed addresses when the team genuinely knows the recipient.
- Require explicit campaign assignment before generating outreach.
- Require review and approval before the first send.
- Stop automated follow-up when a recipient replies, registers, unsubscribes, or
  is removed from the campaign.
- Keep sent messages immutable and record resends as new attempts.
- Preserve archived contacts and campaign history for reporting.
- Treat Eventbrite as the ticketing source of truth and Ellie AI as the
  marketing and relationship source of truth.

## Current integrations

| Integration | Purpose |
| --- | --- |
| Eventbrite | Events, publishing, orders, attendees, check-ins, and sales |
| Emailable | Email deliverability verification |
| Resend | Transactional and campaign email delivery |
| Apollo | Organization and eligible people discovery |
| OpenAI | Jarvis response generation and workspace assistance |
| Obsidian bridge | Approved long-term notes for Jarvis |
| MongoDB | Primary application data and workflow history |

Integration credentials belong only in secured backend environment settings.
They must never be stored in the browser, committed to the repository, included
in screenshots, or shared in documentation.

## Product direction

The current application is an event-marketing CRM built for Ellie AI's operating
workflow. The architecture is moving toward a multi-business product in which
each customer has:

- Their own users, roles, and permissions.
- Their own contacts, events, campaigns, templates, and reporting.
- Their own authorized integrations.
- Isolated credentials and data.
- An audit trail for sensitive actions.

Public access should not expose the operational dashboard. A sellable version
requires authenticated accounts, organization-level data isolation, role-based
permissions, secure onboarding, subscription management, and production audit
controls.

## Additional reference guides

- [Jarvis deployed behavior](docs/JARVIS_DEPLOYED_SETUP.md)
- [Jarvis and Obsidian memory](docs/JARVIS_OBSIDIAN_SETUP.md)
- [Lead data and audience targeting](docs/LEAD_DATA_AND_TARGETING.md)
- [Contact import template](docs/ELLIE_CONTACT_IMPORT_TEMPLATE.csv)
