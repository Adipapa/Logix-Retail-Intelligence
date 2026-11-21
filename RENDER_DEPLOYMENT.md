# Render deployment — Logix Retail Intelligence

This Blueprint deploys the application from the `postgres-migration` branch using the requested free-tier architecture:

- **Frontend:** Render Static Site (free), built with Vite and published from `dist`.
- **API:** Render Python Web Service (free), running FastAPI/Uvicorn.
- **Database:** Existing Neon PostgreSQL project `logix-retail-production`, production branch. No Render database is created.
- **Source:** GitHub repository `Adipapa/Logix-Retail-Intelligence`.
- **Workbook source:** Dropbox, rooted at `/Logix Retail`.

## Important free-tier behaviour

Render Free web services spin down after 15 minutes without inbound traffic and can take about a minute to wake. Their filesystem is ephemeral. The API process and its in-process APScheduler therefore cannot guarantee a 15-minute Dropbox sync cadence while the service is asleep. Do not treat the current in-process scheduler as a reliable production scheduler on the free plan. A separate external scheduled trigger is required for dependable periodic sync; until that is configured, use the administrator's manual Dropbox sync action.

Neon Free currently includes 1 GB storage per project, 100 compute-hours per project per month, and 5 GB monthly public network transfer. Neon compute scales to zero after inactivity. Monitor both Neon and Render usage.

## Create or connect the Render services

1. In Render, choose **New → Blueprint**.
2. Connect `Adipapa/Logix-Retail-Intelligence` and select the `postgres-migration` branch.
3. Review the two resources only:
   - `logix-retail-api`
   - `logix-retail-frontend`
4. Do not add or provision a Render PostgreSQL database.
5. Set the API environment variables below before relying on the deployment.

If these Render services already exist, connect/update the existing services rather than creating duplicate services.

## API environment variables

| Variable | Required value |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Existing Neon **pooled** connection string for the `production` branch |
| `SECRET_KEY` | Generate a new strong random secret in Render |
| `BOOTSTRAP_ADMIN_EMAIL` | Existing central administrator email, or the intended initial admin email |
| `BOOTSTRAP_ADMIN_PASSWORD` | Strong unique password; only used to create the account if it does not already exist |
| `BOOTSTRAP_ADMIN_NAME` | `Logix Central Administrator` |
| `DROPBOX_REFRESH_TOKEN` | Dropbox OAuth refresh token |
| `DROPBOX_APP_KEY` | Dropbox app key |
| `DROPBOX_APP_SECRET` | Dropbox app secret |
| `DROPBOX_ROOT_PATH` | `/Logix Retail` |
| `CORS_ORIGINS` | Exact public frontend origin, e.g. `https://logix-retail-frontend.onrender.com` |

Use the pooled Neon connection URL for the running API. Keep the unpooled URL for controlled maintenance/migration tasks. Never commit either URL or any credential to GitHub or paste secrets into chat. The `DATABASE_URL` variable is intentionally marked `sync: false` so Render requests it as a secret.

The frontend receives `VITE_API_URL` from the API service's `RENDER_EXTERNAL_URL`. Never expose database credentials, Dropbox credentials, or the JWT secret in a `VITE_*` variable.

## Database migration — intentionally gated

The Blueprint does not provision a database and does not automatically run Alembic migrations. This is deliberate: the existing Neon production database must first be inspected and backed up, and the local PostgreSQL database must be exported and reconciled against Neon before any restore or schema migration.

**Do not run `alembic upgrade head`, `pg_restore`, or a full SQL restore against Neon until the destination's current tables, row counts, and Alembic revision have been verified.** A blind restore could overwrite or conflict with existing production data.

Safe migration sequence:
1. Rotate the Neon `neondb_owner` password because a Neon credential was exposed in an earlier setup conversation.
2. Confirm the existing Neon production database's schema, table counts, and `alembic_version` revision.
3. Create a verified backup of Neon before any change.
4. Export the local PostgreSQL database to a custom-format `.dump` file (or a plain SQL dump) and provide that file for inspection.
5. Compare source and destination schemas/data, then restore only into the intended target using a controlled, non-destructive migration plan.
6. Run Alembic only after the migration plan confirms the destination schema is compatible.
7. Verify row counts and key totals after migration before enabling normal writes/imports.

Do not share passwords or connection strings. Only the database dump file and non-secret command output are needed for the next review.

## First deployment checks

- Confirm the API `/health` endpoint returns HTTP 200.
- Confirm Render has the correct Neon pooled `DATABASE_URL`.
- Confirm the frontend `VITE_API_URL` points to the deployed API.
- Confirm `CORS_ORIGINS` exactly matches the deployed frontend origin.
- Confirm login works only after the schema and administrator account are verified.
- Configure Dropbox secrets and test a manual sync.
- Add a separate scheduled trigger before claiming the 15-minute sync is operational.
- Monitor Neon storage, compute-hours, and network transfer quotas.

## Workbook import behaviour

Dropbox scanning is recursive under the configured root. Only Excel workbooks inside station folders are accepted; root-level files, `Cleanup` paths, and Dropbox conflicted copies are excluded. Manual sync processes up to 50 pending workbooks per run. The extraction support remains template-dependent: a successful raw import does not mean every workbook is mapped into dashboard KPIs. Review extraction warnings and unmapped templates before treating reports as reconciled.
