const { Product, Sale, Setting, Shop, User } = require('../models');

exports.listShops = async (req, res, next) => {
  try {
    const shops = await Shop.findAll({
      attributes: ['id', 'name', 'slug', 'isActive', 'createdAt'],
      include: [{ model: Setting, as: 'settings', attributes: ['currency'], required: false }],
      order: [['createdAt', 'DESC']],
    });

    const results = await Promise.all(
      shops.map(async (shop) => {
        const [owner, userCount, productCount, saleCount] = await Promise.all([
          User.findOne({
            where: { shopId: shop.id, role: 'Admin' },
            attributes: ['id', 'name', 'username', 'createdAt'],
            order: [['createdAt', 'ASC']],
          }),
          User.count({ where: { shopId: shop.id } }),
          Product.count({ where: { shopId: shop.id } }),
          Sale.count({ where: { shopId: shop.id } }),
        ]);

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
        };
      })
    );

    res.json(results);
  } catch (error) {
    next(error);
  }
};