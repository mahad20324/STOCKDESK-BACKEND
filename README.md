# STOCKDESK-BACKEND

Backend API for StockDesk.

## Stack

- Node.js
- Express
- Sequelize
- PostgreSQL
- JWT authentication
- PDF receipt generation
- Thermal printer integration

## Setup

1. Copy `.env.example` to `.env`
2. Fill in database, JWT, CORS, and optional super admin settings
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the API:
   ```bash
   npm run dev
   ```

## Scripts

- `npm start` — run the API
- `npm run dev` — run with nodemon
- `npm run sync` — run DB sync utility

## Health Check

- `GET /api` — basic API status
- `GET /api/health` — readiness endpoint for Railway and production monitoring

## Deployment

This repo is ready for Railway.

- Start command: `npm start`
- Health check path: `/api/health`

### Railway Variables

Required:

- `JWT_SECRET`
- `CORS_ORIGINS=https://<your-vercel-domain>`

Recommended:

- `SUPERADMIN_NAME=Platform Administrator`
- `SUPERADMIN_USERNAME=<unique-owner-username>`
- `SUPERADMIN_PASSWORD=<strong-password>`

Database configuration, choose one:

- Preferred: link a Railway PostgreSQL service to this backend service so Railway injects `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`
- Or set `DATABASE_URL` to your PostgreSQL connection string

Do not set these local fallback variables on Railway unless you intentionally want to override the linked database:

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_NAME`
- `DATABASE_USER`
- `DATABASE_PASSWORD`

If any of those are set to local values such as `localhost`, the backend will try to connect there and Railway deployment will fail.

Optional:

- `CORS_ORIGIN_PATTERNS=https://*.vercel.app`
- `DB_SYNC_ALTER=false`

Operational behavior:

- Requests larger than 1 MB are rejected.
- The backend handles `SIGTERM` and `SIGINT` for cleaner Railway shutdowns.

If `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD` are set, the backend will create or normalize a shopless `SuperAdmin` account on boot. That account can use the platform shops dashboard.

`SUPERADMIN_USERNAME` must be unique across all users. If it collides with an existing shop user, startup will skip owner bootstrap and log a warning instead of crashing.

Auth endpoints are rate limited in-process:

- `POST /api/auth/login` — 10 requests per 15 minutes per client IP
- `POST /api/auth/signup` — 5 requests per hour per client IP

See `.env.example` for local development defaults.
