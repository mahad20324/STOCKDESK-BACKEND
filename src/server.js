const dotenv = require('dotenv');

dotenv.config();

const app = require('./app');
const { sequelize, initAppData } = require('./models');

const PORT = process.env.PORT || 4000;

async function runMigrations() {
  // Add 'Split' to paymentMethod enum if it doesn't exist yet
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
}

async function start() {
  try {
    await sequelize.authenticate();
    await runMigrations();
    await sequelize.sync({ alter: true });
    await initAppData();

    app.listen(PORT, () => {
      console.log(`StockDesk backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Unable to start the server:', error);
    process.exit(1);
  }
}

start();
