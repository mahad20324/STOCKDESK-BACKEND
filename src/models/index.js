const { Op } = require('sequelize');
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
const { backfillMissingUsernames } = require('../utils/username');
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
}

async function initAppData() {
  const legacyShop = await findOrCreateLegacyShop();

  await backfillShopOwnership(legacyShop.id);
  await normalizeUserConstraints();
  await backfillMissingUsernames(User);
  await User.update({ role: 'Staff' }, { where: { role: { [Op.in]: ['Cashier', 'Manager'] } } });
  await User.update({ isVerified: true, verificationToken: null }, { where: {} });

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
  initAppData,
};
