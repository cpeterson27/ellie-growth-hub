# Ellie Jarvis Vault Bridge

This is a local courier, not an Ellie backend. It reads only approved Markdown
folders from the local Obsidian vault and mirrors them to the deployed Jarvis
memory collection in MongoDB. The deployed app never receives the vault path.

## How client use works

Your client uses the deployed Ellie website normally. She does not run this
bridge, keep your Mac online, or know the sync secret. The notes from the most
recent successful sync remain in MongoDB and are available to Jarvis even when
this bridge and your Mac are off.

OpenAI writes answers from the cloud copy of those notes. It cannot run this
script, access your Mac, or update the cloud copy by voice command. A request
such as "Jarvis, sync my vault" must not be treated as a completed action.

## One-time setup

1. In Render, set `JARVIS_MEMORY_SOURCE=cloud`,
   `JARVIS_OBSIDIAN_MEMORY_ENABLED=true`, and a long random
   `JARVIS_MEMORY_SYNC_SECRET`.
2. Copy `.env.example` to `.env` on the Mac. Set `OBSIDIAN_VAULT_PATH`,
   `JARVIS_API_URL`, and the same sync secret used by Render. Never commit this
   file.
3. From this directory, run `npm run sync`.

## When to run each command

Use a one-time sync after changing important notes:

```bash
cd /Users/cassandrapeterson/ellie-growth-hub/tools/jarvis-vault-bridge
npm run sync
```

Use watch mode only during a work session when you want local Obsidian changes
mirrored automatically:

```bash
npm run watch
```

Watch mode performs a sync immediately and then every minute. Keep that
Terminal window open while watching. Stop it with `Control + C`. You do not
need to start it before every client conversation or stop it after the client
finishes. If no notes have changed, there is nothing to sync.

For unattended updates, configure this command as a macOS LaunchAgent on the
Mac that owns the vault. Do not place the vault path or sync secret in the
frontend, Jarvis prompts, or client instructions.

## What is synchronized

Only these vault folders are sent: Dashboard, Campaigns, Contacts & ICP,
Partners & Affiliates, Offers & Programs, Marketing Channels, SOPs, and
Decisions. `01 Inbox` and `09 Archive` are deliberately excluded.

Cloud-mode Jarvis conversations are not written back into Obsidian. The bridge
is one-way: approved vault notes go from the Mac to the cloud memory mirror.
