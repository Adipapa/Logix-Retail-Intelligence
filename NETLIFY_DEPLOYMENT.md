# Netlify deployment — Logix Retail Intelligence

## Frontend

Deploy the repository's frontend from the `postgres-migration` branch.

Netlify build settings are defined in `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `dist`
- Node.js: 22

Netlify installs the dependencies from the repository lockfile when one is present.

## Required Netlify environment variable

Set this in **Site configuration → Environment variables**:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | The public HTTPS base URL of the deployed FastAPI backend, with no trailing slash |

Example format: `https://your-api-host.example.com` (replace with the actual backend URL).

Vite embeds `VITE_*` variables into the browser bundle at build time. Set the value before triggering a production deploy, and never put database credentials, Dropbox tokens, JWT secrets, or other private secrets in a `VITE_*` variable.

## Backend and database

Netlify hosts only the React/Vite frontend. Deploy the Python FastAPI service separately and provision PostgreSQL separately. Configure the backend's production environment, including:
- `DATABASE_URL`
- `SECRET_KEY`
- `APP_ENV=production`
- `CORS_ORIGINS` including the exact Netlify site origin
- Dropbox credentials and any bootstrap administrator settings required by the application

Run Alembic migrations against the production database before enabling the frontend. Do not rely on development-time `create_all` for production schema setup.

The backend must be reachable over HTTPS from the browser. Its health endpoint is `/health`.

## Before launch

1. Confirm the production backend URL and set `VITE_API_URL` in Netlify.
2. Add the Netlify site origin to the backend CORS allowlist.
3. Provision PostgreSQL and apply migrations.
4. Configure Dropbox credentials on the backend only.
5. Deploy and verify the Netlify build, login, API connectivity, and Dropbox sync.
