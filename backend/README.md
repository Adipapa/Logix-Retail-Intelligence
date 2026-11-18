# Logix Retail Intelligence API

FastAPI + PostgreSQL backend. Firebase has been removed from the frontend branch. The React application now authenticates against this API; operational dashboard data remains in demonstration mode until the workbook extraction mapping and PostgreSQL reporting endpoints are validated.

## Local setup (Windows / Docker Desktop)

1. Install and start Docker Desktop.
2. Copy `backend/.env.example` to `backend/.env`.
3. In `backend/.env`, set a unique long `SECRET_KEY`, a strong `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters), and the correct admin email. Keep this file private.
4. From the repository root run `docker compose up --build -d`.
5. API health: http://localhost:8000/health
6. Interactive API docs: http://localhost:8000/docs
7. Frontend: run `npm install` then `npm run dev`; set `VITE_API_URL=http://localhost:8000` if needed.

The database and API ports bind to localhost only. Do not expose PostgreSQL publicly.

## Authentication

- `POST /api/v1/auth/login`: JSON email/password; returns a 30-minute JWT.
- `GET /api/v1/auth/me`: requires `Authorization: Bearer <token>`.
- `POST /api/v1/auth/users`: administrator-only account creation.
- Passwords are Argon2-hashed. Public registration is disabled.
- Roles: `admin` and `management`.

## Dropbox inventory

Configure a Dropbox scoped app with only `files.metadata.read` and `files.content.read`. Put the OAuth refresh token, app key and app secret in the private `backend/.env` file. Set `DROPBOX_ROOT_PATH=/Logix Retail` to the root folder containing station folders.

- `GET /api/v1/integrations/dropbox/status`: authenticated inventory status.
- `POST /api/v1/integrations/dropbox/sync`: admin-only initial/manual inventory scan.
- Background metadata scan runs every 15 minutes when Dropbox credentials are configured.
- Tracks Dropbox file ID, path, revision, size and modified time for `.xlsx` and `.xlsm`.
- It does not edit source workbooks or execute macros.

**Important:** this stage inventories Dropbox files and detects revisions. It does not yet extract operational workbook values into PostgreSQL. The extraction mapping must be validated against actual Kotu, Sukuta and other station templates before financial figures are trusted.

## Development vs production

Development startup creates tables automatically. Production must use reviewed Alembic migrations, HTTPS, secure secrets, database backups, restricted admin access, monitoring and a tested restore procedure. Do not deploy this scaffold as a production financial system yet.
