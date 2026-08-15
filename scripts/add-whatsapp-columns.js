#!/usr/bin/env node
/**
 * Simple migration script to add WhatsApp fields to `shops` table.
 * Run from backend/ as: `node scripts/add-whatsapp-columns.js`
 */
const path = require('path');
const models = require('../src/models');

const sequelize = models.sequelize;

async function run() {
  try {
    console.log('Connecting to DB...');
    await sequelize.authenticate();

    console.log('Altering shops table to add WhatsApp columns (if missing)...');

    // PostgreSQL-safe ALTER statements
    await sequelize.query(`ALTER TABLE IF EXISTS shops ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false`);
    await sequelize.query(`ALTER TABLE IF EXISTS shops ADD COLUMN IF NOT EXISTS whatsapp_provider varchar(64) NULL`);
    await sequelize.query(`ALTER TABLE IF EXISTS shops ADD COLUMN IF NOT EXISTS whatsapp_sender_number varchar(64) NULL`);
    await sequelize.query(`ALTER TABLE IF EXISTS shops ADD COLUMN IF NOT EXISTS whatsapp_sender_id varchar(128) NULL`);
    await sequelize.query(`ALTER TABLE IF EXISTS shops ADD COLUMN IF NOT EXISTS whatsapp_opt_in_text text NULL`);

    console.log('Done. Please restart the backend if it is running.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
