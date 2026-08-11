const sequelize = require('../config/db');

// List of (table, column, referencedTable) to ensure FK uses ON DELETE CASCADE
const fks = [
  { table: 'users', column: 'shopId', referencedTable: 'shops' },
  { table: 'customers', column: 'shopId', referencedTable: 'shops' },
  { table: 'dayClosures', column: 'shopId', referencedTable: 'shops' },
  { table: 'products', column: 'shopId', referencedTable: 'shops' },
  { table: 'sales', column: 'shopId', referencedTable: 'shops' },
  { table: 'saleItems', column: 'shopId', referencedTable: 'shops' },
  { table: 'receipts', column: 'shopId', referencedTable: 'shops' },
  { table: 'settings', column: 'shopId', referencedTable: 'shops' },
  { table: 'expenses', column: 'shopId', referencedTable: 'shops' },
  { table: 'stockIns', column: 'shopId', referencedTable: 'shops' },
  { table: 'saleReturns', column: 'shopId', referencedTable: 'shops' },
  { table: 'audits', column: 'shopId', referencedTable: 'shops' },
  { table: 'stockReconciliations', column: 'shopId', referencedTable: 'shops' },
];

async function findConstraintName(table, column) {
  const sql = `
    SELECT tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND kcu.column_name ILIKE $2
  `;
  const replacements = [table, column];
  const [results] = await sequelize.query(sql, { bind: replacements });
  if (results && results.length > 0) return results[0].constraint_name;
  return null;
}

function quoteIdent(name) {
  return `"${name}"`;
}

async function ensureCascade(table, column, referencedTable) {
  const constraint = await findConstraintName(table, column);
  const schema = 'public';
  const tableQ = `${quoteIdent(table)}`;
  const refTableQ = `${quoteIdent(referencedTable)}`;

  if (!constraint) {
    const newName = `fk_${table}_${column}`;
    console.log(`No existing FK for ${table}.${column}, creating ${newName} -> ${referencedTable}(id)`);
    const createSql = `ALTER TABLE ${tableQ} ADD CONSTRAINT "${newName}" FOREIGN KEY ("${column}") REFERENCES ${refTableQ}("id") ON DELETE CASCADE`;
    await sequelize.query(createSql);
    return { table, column, created: true, constraint: newName };
  }

  console.log(`Found constraint ${constraint} on ${table}.${column}. Replacing with ON DELETE CASCADE`);
  const dropSql = `ALTER TABLE ${tableQ} DROP CONSTRAINT "${constraint}"`;
  const addSql = `ALTER TABLE ${tableQ} ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}") REFERENCES ${refTableQ}("id") ON DELETE CASCADE`;
  await sequelize.query(dropSql);
  await sequelize.query(addSql);
  return { table, column, replaced: true, constraint };
}

async function run() {
  console.log('Starting FK cascade update...');
  try {
    for (const fk of fks) {
      try {
        const res = await ensureCascade(fk.table, fk.column, fk.referencedTable);
        console.log('OK', res);
      } catch (e) {
        console.error(`Failed for ${fk.table}.${fk.column}:`, e.message || e);
      }
    }
  } catch (err) {
    console.error('Error updating FKs:', err);
  } finally {
    await sequelize.close();
    console.log('Done.');
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
