const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Shop, ShopActivity, User, Setting, sequelize } = require('../models');
const { Op } = require('sequelize');
const { normalizeUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');
const { logAction } = require('./auditController');
const emailService = require('../services/emailService');

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

    // Block login until email is verified
    if (!user.isVerified) {
      const maskedEmail = maskEmail(user.email);
      return res.status(403).json({
        message: 'Please verify your email address before signing in. Check your inbox for the verification link.',
        needsVerification: true,
        email: maskedEmail,
      });
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
      email,
      username,
      password,
      confirmPassword,
    } = req.body;

    const normalizedShopName = shopName ? String(shopName).trim() : '';
    const normalizedEmail    = email    ? String(email).trim().toLowerCase() : '';
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedShopName || !normalizedEmail || !normalizedUsername || !password || !confirmPassword) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Shop name, email, admin username, password, and confirm password are required' });
    }

    if (password !== confirmPassword) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const emailTaken = await User.findOne({ where: { email: normalizedEmail }, transaction });
    if (emailTaken) {
      await transaction.rollback();
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const existingShop = await Shop.findOne({
      where: { name: { [Op.iLike]: normalizedShopName } },
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
      { shopName: shop.name, address: '', phone: '', currency: 'USD', shopId: shop.id },
      { transaction }
    );

    const existingUser = await User.findOne({ where: { shopId: shop.id, username: normalizedUsername }, transaction });
    if (existingUser) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Username is already in use for this shop' });
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(password, 10);

    const user = await User.create(
      {
        name: normalizedUsername,
        username: normalizedUsername,
        email: normalizedEmail,
        password: hash,
        role: 'Admin',
        shopId: shop.id,
        isVerified: false,
        verificationToken: verifyToken,
      },
      { transaction }
    );

    await transaction.commit();

    // Await so we can tell the user if delivery fails
    try {
      await emailService.sendVerificationEmail(normalizedEmail, normalizedShopName, verifyToken);
    } catch (emailErr) {
      console.error('Verification email failed:', emailErr.message);
      return res.status(201).json({
        message: 'Account created! We could not send the verification email right now — please use "Resend verification email" on the next screen.',
        email: maskEmail(normalizedEmail),
      });
    }

    res.status(201).json({
      message: 'Account created! Check your email to verify and activate your account.',
      email: maskEmail(normalizedEmail),
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Username is already in use. Choose a different admin username.' });
    }
    next(error);
  }
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = String(email).split('@');
  return `${local[0] || '*'}***@${domain}`;
}

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

// ─── Email verification ───────────────────────────────────────────────────────
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    const user = await User.findOne({
      where: { verificationToken: token, isVerified: false },
      include: [{ model: Shop, as: 'shop', attributes: ['name'] }],
    });

    if (!user) {
      return res.status(400).json({ message: 'This verification link is invalid or has already been used.' });
    }

    await user.update({
      isVerified: true,
      verificationToken: `Admin:${user.id}`,
    });

    res.json({
      message: 'Email verified! Your account is now active. You can sign in.',
      shopName: user.shop?.name || '',
      username: user.username,
    });
  } catch (error) {
    next(error);
  }
};

exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const SAFE = { message: 'If that email is registered and unverified, a new verification link has been sent.' };

    const user = await User.findOne({ where: { email: normalizedEmail, isVerified: false } });
    if (!user) return res.json(SAFE);

    const verifyToken = crypto.randomBytes(32).toString('hex');
    await user.update({ verificationToken: verifyToken });

    const shop = await Shop.findByPk(user.shopId, { attributes: ['name'] });
    emailService
      .sendVerificationEmail(normalizedEmail, shop?.name || 'your shop', verifyToken)
      .catch((err) => console.error('Resend verification failed:', err.message));

    res.json(SAFE);
  } catch (error) {
    next(error);
  }
};

// ─── Forgot / reset password ──────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const SAFE = { message: 'If that email is registered, a password reset link has been sent to your inbox.' };

    const user = await User.findOne({
      where: { email: normalizedEmail, isVerified: true },
    });
    if (!user) return res.json(SAFE);

    const resetToken   = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await user.update({ passwordResetToken: resetToken, passwordResetExpires: resetExpires });

    const shop = await Shop.findByPk(user.shopId, { attributes: ['name'] });
    emailService
      .sendPasswordResetEmail(normalizedEmail, shop?.name || 'your shop', resetToken)
      .catch((err) => console.error('Password reset email failed:', err.message));

    res.json(SAFE);
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Token, password, and confirm password are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await user.update({ password: hash, passwordResetToken: null, passwordResetExpires: null });

    res.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};
