# Deploying Jarvis with Obsidian Memory

## What runs where

Render runs the Growth Operator frontend, backend, MongoDB connection, and Jarvis API.
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
JARVIS_RESEARCH_OPENAI_MODEL=gpt-5.6-sol
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

## Jarvis public-web lead research

With OpenAI API billing active and `JARVIS_OPENAI_ENABLED=true`, a request such
as “Find 20 Sacramento multifamily decision-makers” runs a public-web search
inside Jarvis. Every retained person must have non-LinkedIn HTTPS evidence.
Emails are stored only when visibly published by the cited source and remain
`published_unverified`. Results are staged in **Discovery → Jarvis Research
Previews**; no CRM import or outreach occurs without a separate confirmation.

## Frontend SPA routing on Render

The frontend uses React Router. In the Render **frontend Static Site**, open
**Redirects/Rewrites** and add:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | `Rewrite` |

Without this rule, navigation works inside Ellie but directly opening or hard
refreshing `/jarvis`, `/discovery`, or another nested route returns Render's
black `Not Found` page before React can load.

## Development request approval queue

Jarvis can recognize explicit software-change requests and place them in the
Development Requests queue. Jarvis never edits code or deploys from a normal
conversation.

1. Generate a long random secret with `openssl rand -hex 32`.
2. Add it to the backend environment as `DEVELOPMENT_APPROVAL_SECRET`.
3. Add the same variable to the Render backend service.
4. Open **Development Requests** in Ellie and enter the secret.
5. Approve a request, then use **Copy for Codex** to hand the approved brief to
   a Codex task attached to this repository.

The secret is retained only in browser `sessionStorage`, so closing the browser
session clears it. Approval creates a structured handoff; it does not
automatically execute, commit, push, or deploy code.

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

## Daily operation

- The client only opens the deployed Ellie frontend and speaks or types to
  Jarvis. She does not run a sync command.
- The last synchronized notes remain available from MongoDB while the
  developer's Mac is off.
- Run `npm run sync` after making note changes that Jarvis needs to know.
- Run `npm run watch` only while actively editing notes and wanting changes
  copied automatically every minute. It does not need to follow the client's
  session.
- Stop watch mode with `Control + C`.
- OpenAI cannot execute the bridge or access the local vault. Jarvis must not
  claim that a spoken "sync" request updated the vault.

Cloud mode is a one-way knowledge mirror. Client conversations are not written
back to Obsidian. If continuous unattended synchronization is required, run the
bridge as a macOS LaunchAgent on the vault owner's Mac.

## Voice and hotkeys

- In Ellie: press `Command + J` while the page is focused to start a voice turn.
- System-wide: compile/run the optional Mac Companion from
  `tools/jarvis-mac-companion`. Its hotkey is `Option + Command + J`.
- Allow Microphone, Speech Recognition, and (when prompted) Input Monitoring in
  macOS Privacy & Security. The companion has no OpenAI key and calls only your
  deployed Jarvis API.
