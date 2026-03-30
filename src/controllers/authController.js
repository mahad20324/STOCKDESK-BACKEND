const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Shop, User, Setting, sequelize } = require('../models');
const { Op } = require('sequelize');
const { generateUniqueUsername } = require('../utils/username');
const { generateUniqueShopSlug } = require('../utils/shop');
const { generateUniqueVerificationToken } = require('../utils/verification');
const { sendVerificationEmail } = require('../services/emailService');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, shopId: user.shopId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

exports.login = async (req, res, next) => {
  try {
    const username = req.body.username ? req.body.username.trim() : '';
    const password = req.body.password;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username/email and password are required' });
    }

    // Try username first, then email (case-insensitive)
    let user = await User.findOne({ where: { username: username } });
    if (!user) {
      user = await User.findOne({ where: { email: { [Op.iLike]: username } } });
    }
    
    if (!user) {
      console.warn(`Login attempt failed: User not found for "${username}"`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.warn(`Login attempt failed: Invalid password for user ${user.email}`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email' });
    }

    console.log(`Successfully logged in: ${user.email}`);
    const token = signToken(user);
    const shop = user.shopId ? await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] }) : null;
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
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
      address,
      phone,
      currency = 'USD',
      name,
      username,
      email,
      password,
    } = req.body;

    if (!shopName || !name || !username || !email || !password) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Shop name, admin name, email, username, and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ where: { email: normalizedEmail }, transaction });
    if (existingUser) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Email is already in use' });
    }

    const shop = await Shop.create(
      {
        name: String(shopName).trim(),
        slug: await generateUniqueShopSlug(Shop, shopName),
      },
      { transaction }
    );

    await Setting.create(
      {
        shopName: shop.name,
        address: address ? String(address).trim() : 'Address not provided',
        phone: phone ? String(phone).trim() : 'Phone not provided',
        currency,
        shopId: shop.id,
      },
      { transaction }
    );

    const resolvedUsername = await generateUniqueUsername(User, {
      username,
      email: normalizedEmail,
      name,
    });
    const verificationToken = await generateUniqueVerificationToken(User);
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create(
      {
        name: String(name).trim(),
        username: resolvedUsername,
        email: normalizedEmail,
        password: hash,
        role: 'Admin',
        shopId: shop.id,
        isVerified: false,
        verificationToken,
      },
      { transaction }
    );

    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        name: user.name,
        shopName: shop.name,
        token: verificationToken,
      });
    } catch (error) {
      await transaction.rollback();
      error.status = error.status || 502;
      error.message = 'Failed to send verification email. Please try again.';
      throw error;
    }

    await transaction.commit();

    res.status(201).json({
      message: 'Verification email sent. Please verify your email before signing in.',
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
    const token = req.query.token ? String(req.query.token).trim() : '';

    if (!token) {
      return res.status(400).send(renderVerificationPage({
        title: 'Verification Failed',
        message: 'Invalid or expired verification token.',
        accent: '#b91c1c',
      }));
    }

    const user = await User.findOne({ where: { verificationToken: token } });
    if (!user) {
      return res.status(400).send(renderVerificationPage({
        title: 'Verification Failed',
        message: 'Invalid or expired verification token.',
        accent: '#b91c1c',
      }));
    }

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    return res.send(renderVerificationPage({
      title: 'Email Verified',
      message: 'Your email has been verified. You can now return to StockDesk and sign in.',
      accent: '#0f766e',
    }));
  } catch (error) {
    next(error);
  }
};

function renderVerificationPage({ title, message, accent }) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
      </head>
      <body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
        <div style="max-width:560px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 16px 50px rgba(15,23,42,0.08);overflow:hidden;">
          <div style="padding:28px 32px;background:${accent};color:#fff;">
            <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.78;">StockDesk</div>
            <h1 style="margin:10px 0 0;font-size:28px;">${title}</h1>
          </div>
          <div style="padding:32px;">
            <p style="margin:0;font-size:16px;line-height:1.7;color:#334155;">${message}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
