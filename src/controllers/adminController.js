const { Op } = require('sequelize');
const { Product, Sale, Setting, Shop, User } = require('../models');

const LIVE_WINDOW_MINUTES = 15;

function getTimeWindow(now = new Date()) {
  const liveThreshold = new Date(now.getTime() - LIVE_WINDOW_MINUTES * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return { liveThreshold, oneHourAgo, startOfDay };
}

async function buildShopSnapshots() {
  const now = new Date();
  const { liveThreshold, oneHourAgo, startOfDay } = getTimeWindow(now);
  const shops = await Shop.findAll({
    attributes: ['id', 'name', 'slug', 'isActive', 'createdAt'],
    include: [{ model: Setting, as: 'settings', attributes: ['currency'], required: false }],
    order: [['createdAt', 'DESC']],
  });

  return Promise.all(
    shops.map(async (shop) => {
      const [owner, userCount, productCount, saleCount, salesLastHour, salesToday, revenueTodayRaw, lastSale] = await Promise.all([
        User.findOne({
          where: { shopId: shop.id, role: 'Admin' },
          attributes: ['id', 'name', 'username', 'createdAt'],
          order: [['createdAt', 'ASC']],
        }),
        User.count({ where: { shopId: shop.id } }),
        Product.count({ where: { shopId: shop.id } }),
        Sale.count({ where: { shopId: shop.id } }),
        Sale.count({ where: { shopId: shop.id, date: { [Op.gte]: oneHourAgo } } }),
        Sale.count({ where: { shopId: shop.id, date: { [Op.gte]: startOfDay } } }),
        Sale.sum('total', { where: { shopId: shop.id, date: { [Op.gte]: startOfDay } } }),
        Sale.findOne({
          where: { shopId: shop.id },
          attributes: ['id', 'total', 'currency', 'paymentMethod', 'date', 'createdAt'],
          order: [['date', 'DESC']],
        }),
      ]);

      const lastSaleAt = lastSale?.date || lastSale?.createdAt || null;
      const isLive = Boolean(lastSaleAt && new Date(lastSaleAt) >= liveThreshold);

      return {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        isActive: shop.isActive,
        createdAt: shop.createdAt,
        currency: shop.settings?.currency || 'USD',
        owner: owner
          ? {
              id: owner.id,
              name: owner.name,
              username: owner.username,
              createdAt: owner.createdAt,
            }
          : null,
        metrics: {
          userCount,
          productCount,
          saleCount,
        },
        activity: {
          isLive,
          liveWindowMinutes: LIVE_WINDOW_MINUTES,
          lastSaleAt,
          salesLastHour,
          salesToday,
          revenueToday: Number(revenueTodayRaw || 0),
        },
      };
    })
  );
}

async function buildRecentSalesFeed() {
  const recentSales = await Sale.findAll({
    attributes: ['id', 'total', 'currency', 'paymentMethod', 'date', 'createdAt'],
    include: [
      {
        model: Shop,
        as: 'shop',
        attributes: ['id', 'name', 'slug'],
      },
      {
        model: User,
        as: 'cashier',
        attributes: ['id', 'name', 'username'],
        required: false,
      },
    ],
    order: [['date', 'DESC']],
    limit: 12,
  });

  return recentSales.map((sale) => ({
    id: sale.id,
    total: Number(sale.total || 0),
    currency: sale.currency || sale.shop?.settings?.currency || 'USD',
    paymentMethod: sale.paymentMethod,
    date: sale.date || sale.createdAt,
    shop: sale.shop
      ? {
          id: sale.shop.id,
          name: sale.shop.name,
          slug: sale.shop.slug,
        }
      : null,
    cashier: sale.cashier
      ? {
          id: sale.cashier.id,
          name: sale.cashier.name,
          username: sale.cashier.username,
        }
      : null,
  }));
}

exports.getOverview = async (req, res, next) => {
  try {
    const shops = await buildShopSnapshots();
    const recentSales = await buildRecentSalesFeed();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const summary = {
      totalShops: shops.length,
      activeShops: shops.filter((shop) => shop.isActive).length,
      liveShops: shops.filter((shop) => shop.activity?.isLive).length,
      newShopsToday: shops.filter((shop) => new Date(shop.createdAt) >= startOfDay).length,
      totalUsers: shops.reduce((sum, shop) => sum + Number(shop.metrics?.userCount || 0), 0),
      totalSalesToday: shops.reduce((sum, shop) => sum + Number(shop.activity?.salesToday || 0), 0),
      revenueToday: shops.reduce((sum, shop) => sum + Number(shop.activity?.revenueToday || 0), 0),
    };

    res.json({
      generatedAt: new Date().toISOString(),
      liveWindowMinutes: LIVE_WINDOW_MINUTES,
      summary,
      shops,
      recentSales,
    });
  } catch (error) {
    next(error);
  }
};

exports.listShops = async (req, res, next) => {
  try {
    const shops = await buildShopSnapshots();
    res.json(shops);
  } catch (error) {
    next(error);
  }
};