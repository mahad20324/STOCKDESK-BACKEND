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
const Setting = require('./setting');
const ShopActivity = require('./shopActivity');
const UserProfile = require('./userProfile');
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

Shop.hasOne(ShopActivity, { foreignKey: 'shopId', as: 'activityLog' });
ShopActivity.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

User.hasOne(UserProfile, { foreignKey: 'userId', as: 'profile' });
UserProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(ShopActivity, { foreignKey: 'lastActiveUserId', as: 'activityEvents' });
ShopActivity.belongsTo(User, { foreignKey: 'lastActiveUserId', as: 'lastActiveUser' });

User.hasMany(Sale, { foreignKey: 'cashierId', as: 'sales' });
Sale.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });

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
  await User.update({ shopId }, { where: { shopId: null } });
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
      SELECT tc.constraint_name, array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'users'
        AND tc.constraint_type = 'UNIQUE'
      GROUP BY tc.constraint_name
    `);

    for (const constraint of constraints) {
      const columns = Array.isArray(constraint.columns) ? constraint.columns : [];
      const isLegacySingleColumnConstraint =
        columns.length === 1 && ['username', 'email', 'verificationToken'].includes(columns[0]);

      if (isLegacySingleColumnConstraint) {
        await sequelize.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "${constraint.constraint_name}"`);
      }
    }

    await sequelize.query('DROP INDEX IF EXISTS "users_username_key"');
    await sequelize.query('DROP INDEX IF EXISTS "users_email_key"');
    await sequelize.query('DROP INDEX IF EXISTS "users_verificationToken_key"');
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "users_shopId_username_unique" ON "users" ("shopId", "username")');
  } catch (error) {
    console.warn('Skipping legacy user constraint normalization:', error.message);
  }
}

async function ensureSuperAdmin() {
  const configuredPassword = process.env.SUPERADMIN_PASSWORD ? String(process.env.SUPERADMIN_PASSWORD) : '';
  const configuredName = process.env.SUPERADMIN_NAME ? String(process.env.SUPERADMIN_NAME).trim() : 'Platform Administrator';
  const configuredUsername = process.env.SUPERADMIN_USERNAME ? String(process.env.SUPERADMIN_USERNAME).trim().toLowerCase() : 'superadmin';

  if (!configuredUsername) {
    return;
  }

  let user = await User.findOne({ where: { shopId: null, username: configuredUsername } });

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
}

async function backfillUserProfiles() {
  const users = await User.findAll({ attributes: ['id', 'role'], where: { role: { [Op.ne]: 'SuperAdmin' } } });

  for (const user of users) {
    const displayRole = user.role === 'Admin' ? 'Admin' : 'Cashier';
    await UserProfile.findOrCreate({
      where: { userId: user.id },
      defaults: { displayRole },
    });
  }
}

async function initAppData() {
  const legacyShop = await findOrCreateLegacyShop();

  await backfillShopOwnership(legacyShop.id);
  await normalizeUserConstraints();
  await backfillMissingUsernames(User);
  await User.update({ role: 'Staff' }, { where: { role: { [Op.in]: ['Cashier', 'Manager'] } } });
  await User.update({ isVerified: true, verificationToken: null }, { where: {} });
  await backfillUserProfiles();

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
  Setting,
  ShopActivity,
  UserProfile,
  initAppData,
};
