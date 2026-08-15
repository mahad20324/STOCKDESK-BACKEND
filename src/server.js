const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Set it in your backend environment before starting StockDesk.');
  process.exit(1);
}

const app = require('./app');
const { sequelize, initAppData } = require('./models');
const { startAutoCloseScheduler } = require('./utils/autoCloseBusinessDay');

async function runMigrations() {
  // Add 'Split' to paymentMethod enum if it doesn't exist yet
  // Sequelize alter:true cannot add values to existing PostgreSQL ENUMs
  try {
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'enum_sales_paymentMethod'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'Split'
            AND enumtypid = (
              SELECT oid
              FROM pg_type
              WHERE typname = 'enum_sales_paymentMethod'
            )
        ) THEN
          ALTER TYPE "enum_sales_paymentMethod" ADD VALUE 'Split';
        END IF;
      END $$;
    `);
    console.log('[migrations] Enum migration completed successfully');
  } catch (error) {
    console.error('[migrations] Enum migration failed:', error.message);
    // Do not silently ignore; log and allow app to continue
    // Enum migration failures may be non-fatal (e.g., already exists on retry)
  }
}

async function initializeDatabase() {
  try {
    console.log('[db-init] Starting background database initialization...');
    await runMigrations();
    console.log('[db-init] Running Sequelize sync...');
    await sequelize.sync({ alter: { drop: false } });
    console.log('[db-init] Initializing application data...');
    await initAppData();
    console.log('[db-init] Database initialization completed successfully');
    startAutoCloseScheduler();
  } catch (error) {
    console.error('[db-init] Background database initialization failed:', error.message);
    // Log the failure but do not exit; the app is already listening and may recover
    // Operators should monitor logs for this condition
  }
}

async function start() {
  try {
    console.log('[startup] Verifying database connection...');
    await sequelize.authenticate();
    console.log('[startup] Database connection verified');

    // Start listening BEFORE heavy DB work so healthcheck can pass quickly
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[startup] StockDesk backend listening on port ${PORT}`);
    });

    // Run database initialization in the background after server is listening
    setImmediate(initializeDatabase);
  } catch (error) {
    console.error('[startup] Failed to verify database connection:', error.message);
    process.exit(1);
  }
}

start();
