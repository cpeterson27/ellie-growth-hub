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

## Notes

- The backend folder is present but not wired into the frontend yet.
- The dashboard UI is fully scaffolded with responsive navigation, reusable components, table and chart layouts.
