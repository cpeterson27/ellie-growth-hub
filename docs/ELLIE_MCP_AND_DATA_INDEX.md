# Ellie-owned data and AI connections

## What the business index means

The index is Ellie's own searchable MongoDB collection of business facts imported from sources Ellie is legally allowed to use. Each record keeps its dataset name, source URL, license, and observation date. The first target is California, with Sacramento-area searches used as the quality test before national expansion.

The owner does **not** need to create `ELLIE_BUSINESS_DATA_API_URL` or `ELLIE_BUSINESS_DATA_API_KEY`. Ellie searches the owned index by default. Those variables remain optional for a future licensed feed.

Sacramento-area searches can also use Ellie's small live OpenStreetMap pilot when the owned index has no matching records. Results retain their individual OpenStreetMap evidence URL and attribution. This pilot is deliberately bounded; national-scale ingestion should use downloadable regional extracts or an Ellie-hosted data service instead of placing bulk load on a public API.

An owner or admin can load normalized records through `POST /api/business-index/imports`. Required fields per row are `name` and `sourceUrl`; the request also requires `sourceDataset`. Upserts use `sourceDataset + sourceRecordId`, so refreshes do not create duplicates.

## Growth Operator MCP

Growth Operator by Ellie exposes a stateless Streamable HTTP MCP endpoint at `/mcp`. Development access uses revocable, expiring personal access tokens created through `/api/mcp-access-tokens`. The plaintext token is displayed once; MongoDB stores only its SHA-256 hash.

Available tools:

- `ellie_status`
- `list_prospect_lists`
- `search_ranked_leads`
- `plan_market_research`
- `start_market_research`

The first release intentionally does not expose email sending. All calls are workspace-scoped and written to an MCP audit log.

## Public OAuth connection

Ellie implements OAuth discovery, dynamic client registration, authorization-code flow with mandatory PKCE S256, one-time codes, one-hour access tokens, rotating 90-day refresh tokens, a browser consent screen, scoped MCP tools, audit logging, and user-initiated disconnect.

Production should set `PUBLIC_BACKEND_URL` to the HTTPS backend origin if Render does not expose `RENDER_EXTERNAL_URL`; `FRONTEND_URL` must contain the deployed Ellie frontend origin. Public app availability still depends on the connected AI product's plan, developer-mode access, review requirements, and app configuration. A ChatGPT subscription does not fund OpenAI API usage inside Ellie.

## ChatGPT Plus private GPT Actions

ChatGPT Plus users can create a private Custom GPT and import Ellie's hosted OpenAPI schema from `/gpt-actions/openapi.json`. Configure the Action authentication as API Key, Bearer, using a 90-day token created in Ellie Settings → AI connections. Keep that GPT private because its creator-managed bearer token represents one Ellie user and workspace.

The Action surface can check status, list prospect lists, search saved ranked leads, plan research, start a confirmed research job, and check job progress. It cannot send campaigns, delete CRM records, or change the CRM schema. The public privacy disclosure is available at `/gpt-actions/privacy`.

## Email risk policy

Ellie's no-credit checker validates syntax, MX availability, known disposable domains, role addresses, and the Resend-backed suppression list. It does not use SMTP recipient probing, rotate IP addresses, enumerate mailboxes, or label a mailbox verified merely because its domain accepts email.
