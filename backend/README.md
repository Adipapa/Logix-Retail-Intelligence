# Logix Retail Intelligence API

FastAPI + PostgreSQL backend. Firebase is being retired; the React frontend must call this API and must not connect directly to PostgreSQL.

## Local setup

1. Install Docker Desktop.
2. Copy `.env.example` to `.env` in this directory.
3. Set a long random `SECRET_KEY` and a unique bootstrap admin password (minimum 12 characters).
4. From the repository root run `docker compose up --build`.
5. API health: http://localhost:8000/health
6. Interactive API docs: http://localhost:8000/docs

The first development startup creates the initial tables and an administrator from the bootstrap environment variables. Do not use automatic `create_all` for production; add and run Alembic migrations before production deployment.

## Authentication

- `POST /api/v1/auth/login`: JSON body with email and password; returns a short-lived JWT.
- `GET /api/v1/auth/me`: requires `Authorization: Bearer <token>`.
- `POST /api/v1/auth/users`: administrator-only account creation. There is no public registration endpoint.
- Passwords are Argon2-hashed. Never store or log plaintext passwords.
- Roles: `admin` and `management`.

## Important

The frontend in the current repository still contains Firebase Auth and Firestore references. This backend scaffold is the first migration step, not proof that Firebase has already been removed from the frontend. The next step is to replace the frontend auth and repository layer, then add the operational PostgreSQL models and Alembic migrations.
