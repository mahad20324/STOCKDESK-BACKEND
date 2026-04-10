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

async function start() {
  try {
    const { warnings } = validateEnvironment();

    warnings.forEach((warning) => {
      console.warn(`Environment warning: ${warning}`);
    });

    setRuntimeStatus('starting');

    await sequelize.authenticate();
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
