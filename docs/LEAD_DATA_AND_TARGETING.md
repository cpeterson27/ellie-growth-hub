# Ellie lead data and targeting

## Recommended operating model

Use Monday CRM as Ellie's ongoing working CRM when the team already maintains
contacts there. Use CSV for the first bulk import, Apollo exports, or occasional
lists from another source. Both sources ultimately create or update the same
contact records in Ellie.

CSV is currently the richest initial import path. Monday becomes equally useful
after its board column IDs are mapped in the Monday integration credentials.

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

For the $15K program, select its campaign during import and use tags such as
`15k-program`, `multifamily`, and `portfolio-growth`. Campaign assignment is the
primary offer relationship; tags provide reusable secondary filters.

## Monday board fields

The Monday item name is the contact name. The board must contain an email column.
Ellie recognizes `lead_email`, `email`, `Email`, or `contact_email` by default.
It recognizes `lead_company` or `company` for company.

Map these additional Ellie fields to the actual Monday column IDs in the Monday
integration's `columnIds` object:

```json
{
  "email": "lead_email",
  "company": "lead_company",
  "firstName": "first_name",
  "lastName": "last_name",
  "title": "job_title",
  "phone": "phone",
  "industry": "industry",
  "city": "city",
  "state": "state",
  "country": "country",
  "linkedin": "linkedin_url",
  "website": "website",
  "stage": "lead_stage",
  "notes": "notes"
}
```

Column IDs are Monday's internal IDs, not necessarily the labels shown at the
top of the board. After the connection and board ID are configured, use
**Discovery → Import prospects → Monday CRM** to pull the board into Ellie.

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
