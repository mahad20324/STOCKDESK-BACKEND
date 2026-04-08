const { Setting, Shop, ShopActivity, User } = require('../models');

const ACTIVE_WINDOW_HOURS = 24;

async function buildShopSnapshots() {
  const shops = await Shop.findAll({
    attributes: ['id', 'name', 'slug', 'isActive', 'createdAt'],
    include: [
      { model: Setting, as: 'settings', attributes: ['currency'], required: false },
      {
        model: ShopActivity,
        as: 'activityLog',
        attributes: ['lastLoginAt', 'lastActiveUserId'],
        required: false,
        include: [
          {
            model: User,
            as: 'lastActiveUser',
            attributes: ['id', 'name', 'username', 'role'],
            required: false,
          },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });

  return Promise.all(
    shops.map(async (shop) => {
      const [owner, userCount] = await Promise.all([
        User.findOne({
          where: { shopId: shop.id, role: 'Admin' },
          attributes: ['id', 'name', 'username', 'createdAt'],
          order: [['createdAt', 'ASC']],
        }),
        User.count({ where: { shopId: shop.id } }),
      ]);

      const lastLoginAt = shop.activityLog?.lastLoginAt || null;

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
        },
        activity: {
          lastLoginAt,
          lastActiveUser: shop.activityLog?.lastActiveUser
            ? {
                id: shop.activityLog.lastActiveUser.id,
                name: shop.activityLog.lastActiveUser.name,
                username: shop.activityLog.lastActiveUser.username,
                role: shop.activityLog.lastActiveUser.role,
              }
            : null,
        },
      };
    })
  );
}

exports.getOverview = async (req, res, next) => {
  try {
    const shops = await buildShopSnapshots();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const recentActivityThreshold = new Date(Date.now() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000);

    const summary = {
      totalShops: shops.length,
      activeShops: shops.filter((shop) => shop.isActive).length,
      recentlyActiveShops: shops.filter((shop) => shop.activity?.lastLoginAt && new Date(shop.activity.lastLoginAt) >= recentActivityThreshold).length,
      newShopsToday: shops.filter((shop) => new Date(shop.createdAt) >= startOfDay).length,
      totalUsers: shops.reduce((sum, shop) => sum + Number(shop.metrics?.userCount || 0), 0),
    };

    res.json({
      generatedAt: new Date().toISOString(),
      activityWindowHours: ACTIVE_WINDOW_HOURS,
      summary,
      shops,
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