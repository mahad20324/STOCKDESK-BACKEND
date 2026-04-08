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

- `GET /api`

## Deployment

This repo is ready for Railway.

- Start command: `npm start`
- Health check path: `/api`

### Railway Variables

Required:

- `JWT_SECRET`
- `CORS_ORIGINS=https://<your-vercel-domain>`

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
- `SUPERADMIN_NAME=Platform Administrator`
- `SUPERADMIN_USERNAME=superadmin`
- `SUPERADMIN_PASSWORD=<strong-password>`

If `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD` are set, the backend will create or normalize a shopless `SuperAdmin` account on boot. That account can use the platform shops dashboard.

See `.env.example` for local development defaults.
