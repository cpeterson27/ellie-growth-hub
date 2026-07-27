# Ellie lead data and targeting

## Recommended operating model

MongoDB is Ellie AI's single contact database and source of truth. CSV is the
primary bulk import path for signup sheets, Apollo exports, and external lists.
Contact creation, research status, qualification, campaign membership, and
outreach history remain in Ellie AI; contact imports do not synchronize to
Monday CRM.

## Email verification during CSV import

CSV email addresses are not saved immediately. After uploading the file:

1. Review the preview and click **Verify emails**.
2. Ellie sends only the unique email addresses to Emailable. A live Emailable
   credit is normally used for each verification.
3. Deliverable addresses are saved with `Email Status` set to `verified`.
4. Risky, unknown, and undeliverable addresses are removed before the contact
   reaches MongoDB. The contact is still imported without an email and receives
   the `needs-email-verification` tag for later review.
5. A suggested correction is displayed in the preview but is never applied
   automatically.

Keep `EMAILABLE_API_KEY` private in the backend environment. The deployed Render
backend also needs this environment variable; setting it only in `backend/.env`
configures local development.

## Progressive contact research

Ellie never guesses unreadable signup-sheet data. On CSV import, it checks
`Company Name`, `Title`, and `Industry`, because those are the minimum useful
targeting fields:

- if any are blank, the contact enters **Needs Research**, receives the
  `needs-research` tag, and cannot be marked qualified;
- when all three are filled, the contact moves to **Ready for Review**;
- a person becomes **Qualified** only after Ellie checks the qualification box;
- verified email status remains a separate safety requirement for email
  outreach.

Use **Contacts → Needs Research → Edit** to fill confirmed information over
time. The detail view shows exactly which targeting fields are still missing.
Use the **Qualified** tab as the safe pool when associating people with targeted
campaigns. `Lists` preserve the original event or source group, while `Tags`
remain reusable audience labels.

### Automatic campaign matching

Campaign audience labels now match against confirmed contact titles, industries,
seniority, companies, tags, keywords, lists, and notes. Ellie automatically
associates matches when a campaign is created, and the campaign workspace has a
**Refresh and assign safe matches** action for contacts qualified later.

A contact must pass every safety gate before matching:

- `researchStatus = qualified`;
- `Qualify Contact = yes`, approved by a person;
- `Email Status = verified`;
- a nonblank email;
- at least one audience keyword match;
- not archived, unsubscribed, invalid, or rejected.

Needs Research and Ready for Review contacts are counted in the campaign
workspace but are never silently added to targeted outreach.

## CSV fields

Only a usable name is required. Email is strongly recommended because it is the
best duplicate key and is required for email outreach.

Start from [`ELLIE_CONTACT_IMPORT_TEMPLATE.csv`](ELLIE_CONTACT_IMPORT_TEMPLATE.csv).

Recommended columns:

| Column | Purpose |
| --- | --- |
| `First Name` | Contact identity |
| `Last Name` | Contact identity |
| `Email` | Deduplication and outreach |
| `Phone` | Contact and deduplication fallback |
| `Company Name` | Account context |
| `Title` | Decision-maker targeting |
| `Industry` | ICP and campaign filtering |
| `City` | Geographic targeting |
| `State` | Geographic targeting |
| `Country` | Geographic targeting |
| `Person Linkedin Url` | Identity and research |
| `Website` | Company research |
| `# Employees` | Company-size filtering |
| `Seniority` | Decision-maker targeting |
| `Departments` | Functional targeting |
| `Keywords` | ICP signals; comma-separated |
| `Lists` | Source list or offer grouping |
| `Stage` | New Lead, Qualified, Nurture, etc. |
| `Qualify Contact` | `yes` or `no` |
| `Tags` | Flexible segments; comma-separated |
| `Notes` | Human context |

For the $15K program, use tags such as `15k-program`, `multifamily`, and
`portfolio-growth`. CSV rows are not assigned directly to campaigns. After
verification, research, and human qualification, Ellie's audience matcher adds
safe contacts to the appropriate campaign.

## How Apollo targeting works

Apollo does not infer Ellie's goal. Every search needs a target definition:

- titles identify the people who can buy or influence;
- industries identify relevant company categories;
- keywords describe business models and intent signals;
- locations constrain geography;
- employee range constrains company size.

Discovery includes starting profiles for:

- real estate decision-makers;
- Airbnb and short-term-rental investors;
- prospects for the $15K program;
- a fully custom search.

Profiles are editable per search. Choosing a different profile does not erase or
change earlier contacts. Organization Search finds and scores companies first.
People Search then finds decision-makers using titles, keywords, locations, and
company domains when the Apollo plan provides People Search API access.

On the current free Apollo plan, Organization Search is available and People
Search is not. The practical workflow is:

1. Choose or edit a target profile.
2. Run Organization Search.
3. Review the matching organizations.
4. Export matching people from Apollo to CSV, or upgrade Apollo for API People
   Search.
5. Import people and assign them to the relevant Ellie campaign.
6. Approve prospects before generating outreach.
