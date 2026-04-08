const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Shop, User, Setting, sequelize } = require('../models');
const { Op } = require('sequelize');
const { normalizeUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, shopId: user.shopId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

exports.login = async (req, res, next) => {
  try {
    const shopName = req.body.shopName ? String(req.body.shopName).trim() : '';
    const username = normalizeUsername(req.body.username);
    const password = req.body.password;

    if (!shopName || !username || !password) {
      return res.status(400).json({ message: 'Shop name, username, and password are required' });
    }

    const shop = await Shop.findOne({
      where: {
        name: {
          [Op.iLike]: shopName,
        },
      },
      attributes: ['id', 'name', 'slug'],
    });

    if (!shop) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    const user = await User.findOne({ where: { shopId: shop.id, username } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        shopId: user.shopId,
        shop,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

exports.signup = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      shopName,
      username,
      password,
      confirmPassword,
    } = req.body;

    const normalizedShopName = shopName ? String(shopName).trim() : '';
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedShopName || !normalizedUsername || !password || !confirmPassword) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Shop name, admin username, password, and confirm password are required' });
    }

    if (password !== confirmPassword) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const existingShop = await Shop.findOne({
      where: {
        name: {
          [Op.iLike]: normalizedShopName,
        },
      },
      transaction,
    });

    if (existingShop) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Shop name is already in use' });
    }

    const shop = await Shop.create(
      {
        name: normalizedShopName,
        slug: await generateUniqueShopSlug(Shop, normalizedShopName),
      },
      { transaction }
    );

    await Setting.create(
      {
        shopName: shop.name,
        address: '',
        phone: '',
        currency: 'USD',
        shopId: shop.id,
      },
      { transaction }
    );

    const existingUser = await User.findOne({ where: { shopId: shop.id, username: normalizedUsername }, transaction });
    if (existingUser) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Username is already in use for this shop' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create(
      {
        name: normalizedUsername,
        username: normalizedUsername,
        email: null,
        password: hash,
        role: 'Admin',
        shopId: shop.id,
        isVerified: true,
        verificationToken: null,
      },
      { transaction }
    );

    await transaction.commit();

    res.status(201).json({
      message: 'Shop created successfully.',
      shopName: shop.name,
      username: user.username,
      password,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};
