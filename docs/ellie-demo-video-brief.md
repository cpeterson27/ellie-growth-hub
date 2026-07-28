# Ellie AI Growth Hub demo brief

## One-sentence explanation

Ellie AI Growth Hub is an event growth operator: it connects event platforms, manages contacts, defines the right audience, matches contacts to campaigns, prepares outreach, and tracks registrations from one workspace.

## Simple workflow to explain in the video

1. **Connect the event source.**
   Eventbrite is connected so Ellie can import the event, refresh ticket sales, registrations, check-ins, and receive automatic webhook updates.

2. **Choose or create the event.**
   The Events page is where the event lives. Eventbrite remains the public ticketing page; Ellie is the operating dashboard around it.

3. **Confirm the targeting brief.**
   Ellie can suggest audience segments from the event listing or from the event draft. Those suggestions are not contacts. They are the campaign targeting rule.

4. **Bring contacts into the CRM.**
   Contacts can come from manual entry, CSV uploads, Apollo exports/searches, existing Ellie CRM records, and later external CRMs or Gmail. Importing contacts does not send email.

5. **Match contacts to the campaign.**
   Ellie compares the approved targeting brief against contact signals like title, industry, company, tags, lists, keywords, notes, and audience profile. Contacts can also be manually assigned.

6. **Review outreach.**
   Ellie prepares campaign email drafts for qualified contacts. Nothing sends automatically. The user reviews, approves, and then sends.

7. **Track results.**
   Eventbrite reporting keeps the dashboard current: tickets sold, attendees, check-ins, revenue, and campaign progress.

## How to explain the Deal to Close Bootcamp state

Deal to Close already has campaign contacts assigned. The remaining audience step is not about importing contacts from scratch. It is about confirming the official targeting brief so Ellie has one source of truth for future matching, Apollo searches, and outreach language.

Current suggested segments include beginner multifamily investors, capital raisers, passive investors, real estate professionals, entrepreneurs, W-2 professionals, medical professionals, and people looking to build passive income through commercial real estate.

## Where contacts come from

- **Ellie CRM:** existing contacts already saved in the system.
- **CSV import:** exported spreadsheets from Apollo, another CRM, or a manual list.
- **Apollo:** organization discovery is available; people search depends on Apollo plan/API permissions.
- **Manual entry:** add one relationship directly.
- **Future CRM integrations:** HubSpot, Salesforce, monday CRM after their real connectors are built.
- **Future Gmail integration:** email threads and replies after Gmail OAuth, sync, and send permissions are built.

## Gmail integration plan

1. Create a Google Cloud project for Ellie.
2. Configure the OAuth consent screen for the Ellie app.
3. Add Gmail API scopes carefully:
   - Read threads/messages for inbox visibility.
   - Send mail only if users should reply/send inside Ellie.
   - Modify labels only if Ellie will archive, label, or mark messages.
4. Add the OAuth redirect URL to Google Cloud.
5. Add backend environment values for Google client ID, client secret, redirect URI, and token encryption.
6. Build backend OAuth routes: start, callback, status, disconnect.
7. Store each client’s encrypted Gmail token separately.
8. Build message sync: threads, participants, dates, subject, snippets, labels, and attachments if needed.
9. Build the dashboard inbox UI: read, draft reply, approve send.
10. Add audit history so every sent email is tied to a contact, campaign, and user action.

## Client-facing setup model

Clients should not give the developer their passwords. The professional flow is:

1. The developer configures Ellie’s app credentials in backend environment settings.
2. The client clicks “Connect” inside Ellie.
3. The client logs into the external platform themselves.
4. The client approves Ellie.
5. Ellie stores an encrypted access token and uses it only for the approved account.

