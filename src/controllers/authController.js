const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Shop, ShopActivity, User, Setting, sequelize } = require('../models');
const { Op } = require('sequelize');
const { normalizeUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');
const { logAction } = require('./auditController');

function getDisplayRole(user) {
  if (user.role === 'SuperAdmin') {
    return 'SuperAdmin';
  }

  const tokenPrefix = typeof user.verificationToken === 'string'
    ? user.verificationToken.split(':', 1)[0]
    : null;

  return ['Admin', 'Manager', 'Cashier'].includes(tokenPrefix)
    ? tokenPrefix
    : user.role === 'Admin'
      ? 'Admin'
      : 'Cashier';
}

function signToken(user) {
  // Enforce minimum 8h regardless of env var to prevent premature logouts
  const configured = process.env.JWT_EXPIRE || '8h';
  const expiresIn = configured === '30m' || configured === '15m' || configured === '1h' ? '8h' : configured;
  return jwt.sign(
    { id: user.id, role: user.role, shopId: user.shopId },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

async function recordShopLoginActivity(user, occurredAt) {
  if (!user.shopId) {
    return;
  }

  try {
    await ShopActivity.upsert({
      shopId: user.shopId,
      lastLoginAt: occurredAt,
      lastActiveUserId: user.id,
    });
  } catch (error) {
    console.warn(`Unable to persist shop login activity for shop ${user.shopId}:`, error.message);
  }
}

exports.login = async (req, res, next) => {
  try {
    const shopName = req.body.shopName ? String(req.body.shopName).trim() : '';
    const username = normalizeUsername(req.body.username);
    const password = req.body.password;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    let shop = null;
    let user = null;

    if (shopName) {
      shop = await Shop.findOne({
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

      user = await User.findOne({ where: { shopId: shop.id, username } });
    } else {
      user = await User.findOne({ where: { shopId: null, username, role: 'SuperAdmin' } });
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    const loginTimestamp = new Date();
    await User.update({ updatedAt: loginTimestamp }, { where: { id: user.id } });
    await recordShopLoginActivity(user, loginTimestamp);

    if (!shop && user.shopId) {
      shop = await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] });
    }

    const token = signToken(user);
    logAction(user.id, user.shopId, 'LOGIN', 'USER', user.id, { username: user.username }, req);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        displayRole: getDisplayRole(user),
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

    user.verificationToken = `Admin:${user.id}`;
    await user.save({ transaction });

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
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Username is already in use. Choose a different admin username.' });
    }
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const freshUser = await User.findByPk(user.id, {
      include: [{ model: require('../models').Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    });

    if (!freshUser) {
      return res.status(401).json({ message: 'User not found' });
    }

    const newToken = signToken(freshUser);
    res.json({
      token: newToken,
      user: {
        id: freshUser.id,
        name: freshUser.name,
        username: freshUser.username,
        role: freshUser.role,
        displayRole: getDisplayRole(freshUser),
        shopId: freshUser.shopId,
        shop: freshUser.shop,
      },
    });
  } catch (error) {
    next(error);
  }
};
