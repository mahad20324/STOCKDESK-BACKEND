const { Op } = require('sequelize');
const {
  Audit,
  Customer,
  DayClosure,
  Expense,
  Product,
  Receipt,
  Sale,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
  Setting,
  Shop,
  StockIn,
  StockReconciliation,
  User,
  sequelize,
} = require('../models');

const ACTIVITY_WINDOW_HOURS = 24;

exports.getOverview = async (req, res, next) => {
  try {
    const shops = await Shop.findAll({
      attributes: ['id', 'name', 'slug', 'isActive', 'createdAt'],
      include: [{ model: Setting, as: 'settings', attributes: ['currency'], required: false }],
      order: [['createdAt', 'DESC']],
    });

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const activityCutoff = new Date(now.getTime() - ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000);

    const results = await Promise.all(
      shops.map(async (shop) => {
        const [owner, userCount, productCount, saleCount, lastSale] = await Promise.all([
          User.findOne({
            where: { shopId: shop.id, role: 'Admin' },
            attributes: ['id', 'name', 'username', 'createdAt'],
            order: [['createdAt', 'ASC']],
          }),
          User.count({ where: { shopId: shop.id } }),
          Product.count({ where: { shopId: shop.id } }),
          Sale.count({ where: { shopId: shop.id } }),
          Sale.findOne({
            where: { shopId: shop.id },
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'createdAt', 'cashierId'],
            include: [{ model: User, as: 'cashier', attributes: ['username', 'role'], required: false }],
          }),
        ]);

        const lastLoginAt = lastSale?.createdAt || null;
        const lastActiveUser = lastSale?.cashier
          ? { username: lastSale.cashier.username, role: lastSale.cashier.role }
          : null;

        return {
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          isActive: shop.isActive,
          createdAt: shop.createdAt,
          currency: shop.settings?.currency || 'USD',
          owner: owner
            ? { id: owner.id, name: owner.name, username: owner.username, createdAt: owner.createdAt }
            : null,
          metrics: { userCount, productCount, saleCount },
          activity: { lastLoginAt, lastActiveUser },
        };
      })
    );

    const totalUsers = await User.count({ where: { shopId: { [Op.not]: null } } });
    const newShopsToday = results.filter((s) => new Date(s.createdAt) >= todayStart).length;
    const recentlyActiveShops = results.filter(
      (s) => s.activity.lastLoginAt && new Date(s.activity.lastLoginAt) >= activityCutoff
    ).length;

    res.json({
      shops: results,
      summary: {
        totalShops: results.length,
        activeShops: results.filter((s) => s.isActive).length,
        recentlyActiveShops,
        newShopsToday,
        totalUsers,
      },
      activityWindowHours: ACTIVITY_WINDOW_HOURS,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteShop = async (req, res, next) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const shopId = shop.id;

    await sequelize.transaction(async (t) => {
      // Delete leaf records that reference SaleReturn and Sale
      await SaleReturnItem.destroy({ where: { shopId }, transaction: t });
      await SaleReturn.destroy({ where: { shopId }, transaction: t });
      await Receipt.destroy({ where: { shopId }, transaction: t });
      await SaleItem.destroy({ where: { shopId }, transaction: t });
      await Sale.destroy({ where: { shopId }, transaction: t });
      // Delete records that reference Products and Users before them
      await DayClosure.destroy({ where: { shopId }, transaction: t });
      await StockReconciliation.destroy({ where: { shopId }, transaction: t });
      await StockIn.destroy({ where: { shopId }, transaction: t });
      await Audit.destroy({ where: { shopId }, transaction: t });
      await Expense.destroy({ where: { shopId }, transaction: t });
      await Product.destroy({ where: { shopId }, transaction: t });
      await Customer.destroy({ where: { shopId }, transaction: t });
      await Setting.destroy({ where: { shopId }, transaction: t });
      // Null out emails before deleting users so the addresses are immediately
      // freed from any unique constraint and can be reused for a new shop.
      await User.update({ email: null }, { where: { shopId }, transaction: t });
      await User.destroy({ where: { shopId }, transaction: t });
      await shop.destroy({ transaction: t });
    });

    res.json({ message: 'Shop and all associated data deleted successfully.' });
  } catch (error) {
    next(error);
  }
};