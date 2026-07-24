# Deploying Jarvis with Obsidian Memory

## What runs where

Render runs the Ellie frontend, backend, MongoDB connection, and Jarvis API.
Your Mac keeps the Obsidian vault. The Vault Bridge mirrors only approved notes
to the `jarvis_memory_notes` MongoDB collection so Render can use them for
Jarvis responses. Render never needs, receives, or exposes the Mac vault path.

## Render backend environment

Set these exact variables in the **backend** Render service, then deploy the
same commit containing the Jarvis routes:

```env
OPENAI_API_KEY=your_openai_key
JARVIS_OPENAI_ENABLED=true
JARVIS_OPENAI_MODEL=gpt-4.1-mini
JARVIS_OBSIDIAN_MEMORY_ENABLED=true
JARVIS_MEMORY_SOURCE=cloud
JARVIS_MEMORY_SYNC_SECRET=a-long-random-secret-you-create-once
```

Do not set `OBSIDIAN_VAULT_PATH` on Render. It is a local Mac path and has no
meaning in the cloud.

Generate the sync secret locally without printing it into source control:

```bash
openssl rand -base64 48
```

Set the result in Render and in the Vault Bridge `.env`; it must match exactly.

## Deploy order

1. Push/deploy the backend code first. `GET /api/jarvis/status` must return
   JSON rather than 404.
2. Deploy the frontend code.
3. Configure and run the Vault Bridge on the Mac.
4. Open Jarvis. Its Memory badge will say connected after the first successful
   bridge sync.

## Vault Bridge setup on the Mac

```bash
cd /Users/cassandrapeterson/ellie-growth-hub/tools/jarvis-vault-bridge
cp .env.example .env
```

Set `OBSIDIAN_VAULT_PATH`, `JARVIS_API_URL`, and the same
`JARVIS_MEMORY_SYNC_SECRET` in that file. Then load the values into your shell
and run `npm run sync`. Use `npm run watch` to refresh the cloud copy every
minute. No local Ellie backend is involved.

The bridge mirrors only the explicitly approved operational folders. It does
not upload `01 Inbox`, `09 Archive`, attachments, or credentials.

## Voice and hotkeys

- In Ellie: press `Command + J` while the page is focused to start a voice turn.
- System-wide: compile/run the optional Mac Companion from
  `tools/jarvis-mac-companion`. Its hotkey is `Option + Command + J`.
- Allow Microphone, Speech Recognition, and (when prompted) Input Monitoring in
  macOS Privacy & Security. The companion has no OpenAI key and calls only your
  deployed Jarvis API.
