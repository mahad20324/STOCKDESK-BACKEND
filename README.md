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
- See `.env.example` for required environment variables.
