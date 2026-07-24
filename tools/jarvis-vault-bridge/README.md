# Ellie Jarvis Vault Bridge

This is a local courier, not an Ellie backend. It reads only approved Markdown
folders from the local Obsidian vault and mirrors them to the deployed Jarvis
memory collection in MongoDB. The deployed app never receives the vault path.

1. In Render, set `JARVIS_MEMORY_SOURCE=cloud` and a long random
   `JARVIS_MEMORY_SYNC_SECRET`.
2. Copy `.env.example` to `.env` on the Mac, set the same secret, and do not
   commit it.
3. Run `npm run sync` once. Use `npm run watch` to refresh the cloud mirror
   every minute. No local Ellie backend is involved.

Only these vault folders are sent: Dashboard, Campaigns, Contacts & ICP,
Partners & Affiliates, Offers & Programs, Marketing Channels, SOPs, and
Decisions. `01 Inbox` and `09 Archive` are deliberately excluded.
