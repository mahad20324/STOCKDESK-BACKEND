const dotenv = require('dotenv');

dotenv.config();

const app = require('./app');
const { sequelize, initAppData } = require('./models');

const PORT = process.env.PORT || 4000;

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
    await sequelize.authenticate();
    await sequelize.sync(getSyncOptions());
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
