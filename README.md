# Ellie AI Growth Operator

A modern SaaS dashboard for event marketing and partnership management.

## Overview

Ellie AI Growth Operator is an AI-powered Event Marketing CRM dashboard for event creators to manage campaigns, partners, ticket sales, outreach, and analytics.

## Tech Stack

- React
- Vite
- JavaScript
- React Router
- Recharts

## Frontend Structure

- `frontend/src/components/` – reusable UI building blocks
- `frontend/src/layouts/` – app shell and page layout
- `frontend/src/pages/` – dashboard, campaigns, partners, marketing, AI content, analytics, settings
- `frontend/src/App.jsx` – router setup
- `frontend/src/main.jsx` – app entry point

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://localhost:4173`.

## Build

```bash
cd frontend
npm run build
```

## Deployed Jarvis and Obsidian memory

The deployed frontend and backend run on Render. Jarvis reads a cloud mirror of
approved Obsidian notes; the browser never reads the local vault directly.

- The client can use deployed Jarvis at any time after the initial sync.
- Run `npm run sync` from `tools/jarvis-vault-bridge` after important note
  changes.
- `npm run watch` is optional and mirrors changes every minute while it remains
  running.
- OpenAI cannot start the local bridge by chat or voice command.

See [docs/JARVIS_DEPLOYED_SETUP.md](docs/JARVIS_DEPLOYED_SETUP.md) for deployment
configuration and [tools/jarvis-vault-bridge/README.md](tools/jarvis-vault-bridge/README.md)
for the exact sync workflow.

See [docs/LEAD_DATA_AND_TARGETING.md](docs/LEAD_DATA_AND_TARGETING.md) for the
canonical CSV fields, Monday board mapping, and Apollo audience workflow.
