# Ellie AI Growth Operator frontend

This directory contains the private React 19 and Vite application for Ellie AI
Growth Operator. The Express API lives in `../backend`.

## Local development

```bash
npm install
printf 'VITE_API_BASE_URL=http://localhost:5001/api\n' > .env
npm run dev
```

Open `http://localhost:5173/login`. The backend must be running, and an owner
account must already exist. See the [project README](../README.md) for backend
setup and owner creation.

`VITE_API_BASE_URL` is the only frontend environment variable. It must include
the `/api` suffix. When omitted, the application defaults to
`http://localhost:5001/api`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create the production build in `dist/` |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

The production host must serve the built single-page application with fallback
routing to `index.html`. Configure its build-time `VITE_API_BASE_URL` to point
to the public backend API. Never place backend credentials in frontend
environment variables.
