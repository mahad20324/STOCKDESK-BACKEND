const dotenv = require('dotenv');

dotenv.config();

const app = require('./app');
const { sequelize, initAppData } = require('./models');
const { validateEnvironment } = require('./config/env');
const { setRuntimeStatus } = require('./state/runtime');

const PORT = process.env.PORT || 4000;
let server;
let shuttingDown = false;

function getSyncOptions() {
  if (process.env.DB_SYNC_ALTER === 'true') {
    return { alter: true };
  }

  if (process.env.NODE_ENV === 'production') {
    return {};
  }

  return { alter: true };
}

async function runMigrations() {
  // Add 'Split' to paymentMethod enum if not already present
  // (Sequelize alter:true cannot add values to existing PostgreSQL ENUMs)
  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'enum_sales_paymentMethod'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'Split'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_sales_paymentMethod')
      ) THEN
        ALTER TYPE "enum_sales_paymentMethod" ADD VALUE 'Split';
      END IF;
    END $$;
  `).catch(() => {});

  // Add new columns to sales table if they don't exist
  // (production sync uses {} so alter:true never runs on existing tables)
  await sequelize.query(`
    ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS tax DECIMAL(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "paymentSplits" JSONB;
  `).catch(() => {});

  // Create audits table if it doesn't exist
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "audits" (
      id SERIAL PRIMARY KEY,
      "userId" INTEGER NOT NULL,
      "shopId" INTEGER NOT NULL,
      action VARCHAR(255) NOT NULL,
      "entityType" VARCHAR(255) NOT NULL,
      "entityId" INTEGER,
      details JSONB,
      "ipAddress" VARCHAR(255),
      "userAgent" VARCHAR(255),
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "audits_shop_created" ON "audits" ("shopId", "createdAt");
    CREATE INDEX IF NOT EXISTS "audits_user_id" ON "audits" ("userId");
    CREATE INDEX IF NOT EXISTS "audits_entity_type" ON "audits" ("entityType");
  `).catch(() => {});

  // Create stock_reconciliations table if it doesn't exist
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "stock_reconciliations" (
      id SERIAL PRIMARY KEY,
      "shopId" INTEGER NOT NULL,
      "productId" INTEGER NOT NULL,
      "systemQuantity" DECIMAL(15,2) NOT NULL,
      "physicalQuantity" DECIMAL(15,2) NOT NULL,
      variance DECIMAL(15,2) NOT NULL,
      reason VARCHAR(255),
      "adjustedByUserId" INTEGER NOT NULL,
      notes TEXT,
      "reconciliationDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "stock_recon_shop_date" ON "stock_reconciliations" ("shopId", "reconciliationDate");
    CREATE INDEX IF NOT EXISTS "stock_recon_product_id" ON "stock_reconciliations" ("productId");
  `).catch(() => {});

  // Create sale_returns table if it doesn't exist
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "sale_returns" (
      id SERIAL PRIMARY KEY,
      "saleId" INTEGER NOT NULL,
      reason VARCHAR(255),
      "totalRefund" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "processedByUserId" INTEGER,
      "shopId" INTEGER,
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "sale_returns_shop" ON "sale_returns" ("shopId");
    CREATE INDEX IF NOT EXISTS "sale_returns_sale" ON "sale_returns" ("saleId");
  `).catch(() => {});

  // Create sale_return_items table if it doesn't exist
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "sale_return_items" (
      id SERIAL PRIMARY KEY,
      "returnId" INTEGER NOT NULL,
      "productId" INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "shopId" INTEGER,
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "sale_return_items_return" ON "sale_return_items" ("returnId");
  `).catch(() => {});
}

async function start() {
  try {
    const { warnings } = validateEnvironment();

    warnings.forEach((warning) => {
      console.warn(`Environment warning: ${warning}`);
    });

    setRuntimeStatus('starting');

    await sequelize.authenticate();
    await runMigrations();
    await sequelize.sync(getSyncOptions());
    await initAppData();

    setRuntimeStatus('ready');

    server = app.listen(PORT, () => {
      console.log(`StockDesk backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    setRuntimeStatus('error', error.message);
    console.error('Unable to start the server:', error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  setRuntimeStatus('shutting-down');
  console.log(`${signal} received. Shutting down StockDesk backend.`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  try {
    await sequelize.close();
  } catch (error) {
    console.error('Error while closing database connection:', error);
  }

  process.exit(0);
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

start();
