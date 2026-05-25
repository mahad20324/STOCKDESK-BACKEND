const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Shop, User, Setting, sequelize } = require('../models');
const { Op } = require('sequelize');
const { normalizeUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, shopId: user.shopId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '8h' }
  );
}

exports.login = async (req, res, next) => {
  try {
    const shopName = req.body.shopName ? String(req.body.shopName).trim() : '';
    const rawIdentifier = req.body.username ? String(req.body.username).trim() : '';
    const password = req.body.password;

    if (!rawIdentifier || !password) {
      return res.status(400).json({ message: 'Shop name, username or email, and password are required' });
    }

    const isEmail = rawIdentifier.includes('@');
    const username = isEmail ? rawIdentifier.toLowerCase() : normalizeUsername(rawIdentifier);

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

      // Try username first, then email
      user = await User.findOne({ where: { shopId: shop.id, username } });
      if (!user && isEmail) {
        user = await User.findOne({ where: { shopId: shop.id, email: username } });
      } else if (!user && !isEmail) {
        user = await User.findOne({
          where: { shopId: shop.id, email: { [Op.iLike]: rawIdentifier } },
        });
      }
    }

    if (!user) {
      user = await User.findOne({ where: { shopId: null, username, role: 'SuperAdmin' } });
      if (!user && isEmail) {
        user = await User.findOne({ where: { shopId: null, email: username, role: 'SuperAdmin' } });
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid shop name, username, or password' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        needsVerification: true,
        email: user.email || '',
        message: 'Please verify your email address before signing in.',
      });
    }

    if (!shop && user.shopId) {
      shop = await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] });
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
      email: rawEmail,
      username,
      password,
      confirmPassword,
    } = req.body;

    const normalizedShopName = shopName ? String(shopName).trim() : '';
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : '';

    if (!normalizedShopName || !normalizedEmail || !normalizedUsername || !password || !confirmPassword) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Shop name, email, username, password, and confirm password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Please enter a valid email address' });
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

    const existingEmail = await User.findOne({ where: { email: normalizedEmail }, transaction });
    if (existingEmail) {
      // Check whether the user's shop still exists — if the shop was deleted but the
      // user row wasn't cleaned up (orphaned record), free the email and continue.
      const ownerShop = existingEmail.shopId
        ? await Shop.findByPk(existingEmail.shopId, { transaction })
        : null;

      if (ownerShop || existingEmail.shopId === null) {
        // Active user (shop exists) or a SuperAdmin — genuinely taken
        await transaction.rollback();
        return res.status(409).json({ message: 'An account with this email already exists' });
      }

      // Orphaned user: shop was deleted but row remained — clear the email so the
      // unique constraint doesn't block the INSERT below, then delete the row.
      await existingEmail.update({ email: null }, { transaction });
      await existingEmail.destroy({ transaction });
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
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create(
      {
        name: normalizedUsername,
        username: normalizedUsername,
        email: normalizedEmail,
        password: hash,
        role: 'Admin',
        shopId: shop.id,
        isVerified: false,
        verificationToken,
      },
      { transaction }
    );

    await transaction.commit();

    try {
      await sendVerificationEmail(normalizedEmail, verificationToken, {
        name: normalizedUsername,
        shopName: shop.name,
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError.message);
      // User was created; they can request a resend later
    }

    res.status(201).json({
      message: 'Account created. Please check your email to verify your account.',
      email: normalizedEmail,
      shopName: shop.name,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    const user = await User.findOne({ where: { verificationToken: token } });
    if (!user) {
      return res.status(400).json({ message: 'This verification link is invalid or has already been used.' });
    }

    await user.update({ isVerified: true, verificationToken: null });

    res.json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};

exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });

    // Always respond with success to avoid email enumeration
    if (!user || user.isVerified) {
      return res.json({ message: 'If that email has a pending verification, a new link has been sent.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await user.update({ verificationToken });
    await sendVerificationEmail(normalizedEmail, verificationToken);

    res.json({ message: 'A new verification link has been sent to your email address.' });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });

    // Always respond with success to avoid email enumeration
    if (user) {
      const resetPasswordToken = crypto.randomBytes(32).toString('hex');
      const resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.update({ resetPasswordToken, resetPasswordExpiry });
      try {
        await sendPasswordResetEmail(normalizedEmail, resetPasswordToken);
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError.message);
      }
    }

    res.json({ message: "If that email is registered, a reset link has been sent to your inbox." });
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

    const user = await User.findOne({ where: { resetPasswordToken: token } });
    if (!user) {
      return res.status(400).json({ message: 'This password reset link is invalid or has already been used.' });
    }
    if (!user.resetPasswordExpiry || new Date() > new Date(user.resetPasswordExpiry)) {
      return res.status(400).json({ message: 'This password reset link has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await user.update({
      password: hash,
      resetPasswordToken: null,
      resetPasswordExpiry: null,
      isVerified: true,
    });

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};
