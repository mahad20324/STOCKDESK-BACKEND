const sequelize = require('../config/db');
const Shop = require('./shop');
const User = require('./user');
const Product = require('./product');
const Sale = require('./sale');
const SaleItem = require('./saleItem');
const Receipt = require('./receipt');
const Setting = require('./setting');
const bcrypt = require('bcrypt');
const { backfillMissingUsernames } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');

Shop.hasMany(User, { foreignKey: 'shopId', as: 'users' });
User.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });

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
  await Product.update({ shopId }, { where: { shopId: null } });
  await Sale.update({ shopId }, { where: { shopId: null } });
  await SaleItem.update({ shopId }, { where: { shopId: null } });
  await Receipt.update({ shopId }, { where: { shopId: null } });
  await Setting.update({ shopId }, { where: { shopId: null } });
}

async function initAppData() {
  const legacyShop = await findOrCreateLegacyShop();

  await backfillShopOwnership(legacyShop.id);
  await backfillMissingUsernames(User);
  await User.update({ isVerified: true }, { where: { verificationToken: null } });

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

  const admin = await User.findOne({ where: { email: 'admin@stockdesk.local' } });
  if (!admin) {
    const password = await bcrypt.hash('Admin@123', 10);
    await User.create({
      name: 'Admin User',
      username: 'admin',
      email: 'admin@stockdesk.local',
      password,
      role: 'Admin',
      shopId: legacyShop.id,
      isVerified: true,
      verificationToken: null,
    });
  } else if (!admin.shopId) {
    admin.shopId = legacyShop.id;
    admin.isVerified = true;
    admin.verificationToken = null;
    await admin.save();
  }

  const mahad = await User.findOne({ where: { username: 'mahad' } });
  if (!mahad) {
    const password = await bcrypt.hash('mahad@123', 10);
    await User.create({
      name: 'Mahad Admin',
      username: 'mahad',
      email: 'mahad@stockdesk.local',
      password,
      role: 'Admin',
      shopId: legacyShop.id,
      isVerified: true,
      verificationToken: null,
    });
  } else if (!mahad.shopId) {
    mahad.shopId = legacyShop.id;
    mahad.isVerified = true;
    mahad.verificationToken = null;
    await mahad.save();
  }
}

module.exports = {
  sequelize,
  Shop,
  User,
  Product,
  Sale,
  SaleItem,
  Receipt,
  Setting,
  initAppData,
};
