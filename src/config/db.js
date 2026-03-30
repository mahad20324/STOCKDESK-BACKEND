const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  process.env.RAILWAY_DATABASE_URL;

const databaseName = process.env.DATABASE_NAME || process.env.PGDATABASE;
const databaseUser = process.env.DATABASE_USER || process.env.PGUSER;
const databasePassword = process.env.DATABASE_PASSWORD || process.env.PGPASSWORD;
const databaseHost = process.env.DATABASE_HOST || process.env.PGHOST || 'localhost';
const databasePort = process.env.DATABASE_PORT || process.env.PGPORT || 5432;
const useSsl =
  ['true', 'require', '1'].includes(String(process.env.DATABASE_SSL || '').toLowerCase()) ||
  Boolean(connectionString);

const sequelize = connectionString
  ? new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: useSsl
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : {},
    })
  : new Sequelize(
      databaseName,
      databaseUser,
      databasePassword,
      {
        host: databaseHost,
        port: databasePort,
        dialect: 'postgres',
        logging: false,
        dialectOptions: useSsl
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: false,
              },
            }
          : {},
      }
    );

module.exports = sequelize;
