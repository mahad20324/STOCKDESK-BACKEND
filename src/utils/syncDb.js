const { sequelize, initAppData } = require('../models');

async function syncDatabase() {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  if (env === 'production') {
    console.error('Refusing to run sync in production. Use migrations instead.');
    process.exit(1);
  }

  try {
    await sequelize.sync({ alter: { drop: false } });
    await initAppData();
    console.log('Database synchronized successfully.');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

syncDatabase();
