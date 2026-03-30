# STOCKDESK-BACKEND

Backend API for StockDesk.

## Stack

- Node.js
- Express
- Sequelize
- PostgreSQL
- JWT authentication
- Nodemailer email verification
- PDF receipt generation
- Thermal printer integration

## Setup

1. Copy `.env.example` to `.env`
2. Fill in database, JWT, CORS, and SMTP settings
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

Optional for temporary hosting with existing profiles only:

- `CORS_ORIGIN_PATTERNS=https://*.vercel.app`
- `VERIFY_EMAIL_BASE_URL=https://<your-railway-domain>/api/auth/verify-email`
- All `SMTP_*` variables

If you are temporarily hosting with signup disabled on the frontend, SMTP is not required for existing users to sign in.

See `.env.example` for local development defaults.
