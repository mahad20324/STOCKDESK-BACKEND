const app = require('./app');
const { sequelize, initAppData } = require('./models');
const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
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
