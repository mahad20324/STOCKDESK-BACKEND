const { sequelize, initAppData } = require('../models');

async function syncDatabase() {
  try {
    await sequelize.sync({ alter: true });
    await initAppData();
    console.log('Database synchronized successfully.');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

syncDatabase();
