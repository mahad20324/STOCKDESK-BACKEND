const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const sequelize = require('../config/db');
const Shop = require('./shop');
const User = require('./user');
const Customer = require('./customer');
const DayClosure = require('./dayClosure');
const Product = require('./product');
const Sale = require('./sale');
const SaleItem = require('./saleItem');
const Receipt = require('./receipt');
const ShopActivity = require('./shopActivity');
const Setting = require('./setting');
const { backfillMissingUsernames, generateUniqueUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');

Shop.hasMany(User, { foreignKey: 'shopId', as: 'users' });
User.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasMany(Customer, { foreignKey: 'shopId', as: 'customers' });
Customer.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasMany(DayClosure, { foreignKey: 'shopId', as: 'dayClosures' });
DayClosure.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasMany(Product, { foreignKey: 'shopId', as: 'products' });
Product.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasMany(Sale, { foreignKey: 'shopId', as: 'sales' });
Sale.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasMany(SaleItem, { foreignKey: 'shopId', as: 'saleItems' });
SaleItem.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasMany(Receipt, { foreignKey: 'shopId', as: 'receipts' });
Receipt.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasOne(Setting, { foreignKey: 'shopId', as: 'settings' });
Setting.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

Shop.hasOne(ShopActivity, { foreignKey: 'shopId', as: 'activity' });
ShopActivity.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

User.hasMany(Sale, { foreignKey: 'cashierId', as: 'sales' });
Sale.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });

User.hasMany(ShopActivity, { foreignKey: 'lastActiveUserId', as: 'shopActivityEntries' });
ShopActivity.belongsTo(User, { foreignKey: 'lastActiveUserId', as: 'lastActiveUser' });

User.hasMany(DayClosure, { foreignKey: 'closedByUserId', as: 'closedDays' });
DayClosure.belongsTo(User, { foreignKey: 'closedByUserId', as: 'closedBy' });

Customer.hasMany(Sale, { foreignKey: 'customerId', as: 'sales' });
Sale.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });

Product.hasMany(SaleItem, { foreignKey: 'productId' });
SaleItem.belongsTo(Product, { foreignKey: 'productId' });

Sale.hasOne(Receipt, { foreignKey: 'saleId', as: 'receipt' });
Receipt.belongsTo(Sale, { foreignKey: 'saleId' });

async function findOrCreateLegacyShop() {
  let shop = await Shop.findOne({ where: { slug: 'stockdesk-shop' } });

  if (!shop) {
    shop = await Shop.create({
      name: 'StockDesk Shop',
      slug: await generateUniqueShopSlug(Shop, 'StockDesk Shop'),
    });
  }

  return shop;
}

async function backfillShopOwnership(shopId) {
  await User.update(
    { shopId },
    {
      where: {
        shopId: null,
        role: { [Op.ne]: 'SuperAdmin' },
      },
    }
  );
  await Customer.update({ shopId }, { where: { shopId: null } });
  await DayClosure.update({ shopId }, { where: { shopId: null } });
  await Product.update({ shopId }, { where: { shopId: null } });
  await Sale.update({ shopId }, { where: { shopId: null } });
  await SaleItem.update({ shopId }, { where: { shopId: null } });
  await Receipt.update({ shopId }, { where: { shopId: null } });
  await Setting.update({ shopId }, { where: { shopId: null } });
}

async function normalizeUserConstraints() {
  try {
    const [constraints] = await sequelize.query(`
      SELECT
        con.conname AS "constraintName",
        array_agg(att.attname ORDER BY cols.ordinality) AS columns
      FROM pg_constraint con
      JOIN pg_class tbl
        ON tbl.oid = con.conrelid
      JOIN pg_namespace ns
        ON ns.oid = tbl.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ordinality)
        ON TRUE
      JOIN pg_attribute att
        ON att.attrelid = tbl.oid
       AND att.attnum = cols.attnum
      WHERE ns.nspname = 'public'
        AND tbl.relname = 'users'
        AND con.contype = 'u'
      GROUP BY con.conname
    `);

    for (const constraint of constraints) {
      const columns = Array.isArray(constraint.columns) ? constraint.columns : [];
      const isLegacySingleColumnConstraint =
        columns.length === 1 && ['username', 'email', 'verificationToken'].includes(columns[0]);

      if (isLegacySingleColumnConstraint) {
        await sequelize.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "${constraint.constraintName}"`);
      }
    }

    const [standaloneIndexes] = await sequelize.query(`
      SELECT idx.indexname AS "indexName"
      FROM pg_indexes idx
      JOIN pg_class index_class
        ON index_class.relname = idx.indexname
      JOIN pg_namespace index_ns
        ON index_ns.oid = index_class.relnamespace
       AND index_ns.nspname = idx.schemaname
      JOIN pg_class table_class
        ON table_class.relname = idx.tablename
      JOIN pg_namespace table_ns
        ON table_ns.oid = table_class.relnamespace
       AND table_ns.nspname = idx.schemaname
      JOIN pg_index index_data
        ON index_data.indexrelid = index_class.oid
       AND index_data.indrelid = table_class.oid
      JOIN LATERAL unnest(index_data.indkey) WITH ORDINALITY AS cols(attnum, ordinality)
        ON cols.attnum > 0
      JOIN pg_attribute att
        ON att.attrelid = table_class.oid
       AND att.attnum = cols.attnum
      LEFT JOIN pg_constraint con
        ON con.conindid = index_class.oid
      WHERE idx.schemaname = 'public'
        AND idx.tablename = 'users'
        AND index_data.indisunique
      GROUP BY idx.indexname, con.oid
      HAVING con.oid IS NULL
         AND count(*) = 1
         AND max(att.attname) IN ('username', 'email', 'verificationToken')
    `);

    for (const index of standaloneIndexes) {
      await sequelize.query(`DROP INDEX IF EXISTS "${index.indexName}"`);
    }

    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "users_shopId_username_unique" ON "users" ("shopId", "username")');
  } catch (error) {
    console.warn('Skipping legacy user constraint normalization:', error.message);
  }
}

async function ensureSuperAdmin() {
  try {
    const configuredPassword = process.env.SUPERADMIN_PASSWORD ? String(process.env.SUPERADMIN_PASSWORD) : '';
    const configuredName = process.env.SUPERADMIN_NAME ? String(process.env.SUPERADMIN_NAME).trim() : 'Platform Administrator';
    const configuredUsername = process.env.SUPERADMIN_USERNAME ? String(process.env.SUPERADMIN_USERNAME).trim().toLowerCase() : 'superadmin';

    if (!configuredUsername) {
      return;
    }

    let user = await User.findOne({ where: { shopId: null, username: configuredUsername } });

    if (!user) {
      const conflictingUser = await User.findOne({ where: { username: configuredUsername } });

      if (conflictingUser) {
        if (conflictingUser.role === 'SuperAdmin') {
          user = conflictingUser;
        } else {
          const location = conflictingUser.shopId === null ? 'shopless account' : `shopId ${conflictingUser.shopId}`;

          console.warn(
            `SUPERADMIN_USERNAME "${configuredUsername}" already matches user ${conflictingUser.id} (${conflictingUser.role}, ${location}). Choose a unique owner username in Railway variables. Skipping super admin bootstrap.`
          );
          return;
        }
      }
    }

    if (!user) {
      if (!configuredPassword) {
        console.warn('SUPERADMIN_USERNAME is set but SUPERADMIN_PASSWORD is missing. Skipping super admin bootstrap.');
        return;
      }

      const passwordHash = await bcrypt.hash(configuredPassword, 10);
      const username = await generateUniqueUsername(User, {
        username: configuredUsername,
        name: configuredName,
      }, undefined, null);

      await User.create({
        name: configuredName,
        username,
        email: null,
        password: passwordHash,
        role: 'SuperAdmin',
        shopId: null,
        isVerified: true,
        verificationToken: null,
      });

      console.log(`Bootstrapped super admin account for ${username}`);
      return;
    }

    let changed = false;

    if (user.role !== 'SuperAdmin') {
      user.role = 'SuperAdmin';
      changed = true;
    }
    if (user.shopId !== null) {
      user.shopId = null;
      changed = true;
    }
    if (!user.isVerified) {
      user.isVerified = true;
      changed = true;
    }
    if (user.verificationToken !== null) {
      user.verificationToken = null;
      changed = true;
    }

    if (changed) {
      await user.save();
      console.log(`Updated ${user.username} to SuperAdmin access`);
    }
  } catch (error) {
    console.warn('Skipping super admin bootstrap:', error.message);
  }
}

async function initAppData() {
  const legacyShop = await findOrCreateLegacyShop();

  await backfillShopOwnership(legacyShop.id);
  await normalizeUserConstraints();
  await backfillMissingUsernames(User);
  await User.update({ role: 'Staff' }, { where: { role: { [Op.in]: ['Cashier', 'Manager'] } } });
  await User.update({ isVerified: true }, { where: {} });

  const defaultSettings = await Setting.findOne({ where: { shopId: legacyShop.id } });
  if (!defaultSettings) {
    await Setting.create({
      shopName: 'StockDesk Shop',
      address: '123 Commerce Avenue',
      phone: '+1234567890',
      currency: 'USD',
      shopId: legacyShop.id,
    });
  }

  const walkInCustomer = await Customer.findOne({ where: { shopId: legacyShop.id, name: 'Walk-in Customer' } });
  if (!walkInCustomer) {
    await Customer.create({
      name: 'Walk-in Customer',
      phone: null,
      email: null,
      address: null,
      notes: 'Default customer profile for counter sales.',
      shopId: legacyShop.id,
      isActive: true,
    });
  }

  await ensureSuperAdmin();
}

module.exports = {
  sequelize,
  Shop,
  User,
  Customer,
  DayClosure,
  Product,
  Sale,
  SaleItem,
  Receipt,
  ShopActivity,
  Setting,
  initAppData,
};
