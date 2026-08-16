const crypto = require('crypto');
const { User, Shop, PendingSignup } = require('../models');
const { Op } = require('sequelize');
const { sendVerificationEmail } = require('../services/emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_URL_REGEX = /^data:image\/(png|jpeg|webp|gif);base64,/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB decoded

function toProfile(user, shop, extra = {}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    shopId: user.shopId,
    shop: shop
      ? { id: shop.id, name: shop.name, slug: shop.slug }
      : null,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    ...extra,
  };
}

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const shop = user.shopId
      ? await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] })
      : null;

    res.json(toProfile(user, shop));
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, avatarUrl } = req.body;
    const updates = {};

    if (name !== undefined) {
      const normalizedName = String(name).trim();
      if (!normalizedName) {
        return res.status(400).json({ message: 'Name is required' });
      }
      updates.name = normalizedName;
    }

    if (email !== undefined) {
      if (email === null || String(email).trim() === '') {
        updates.email = null;
        updates.isVerified = false;
        updates.verificationToken = null;
      } else {
        const normalizedEmail = String(email).trim().toLowerCase();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
          return res.status(400).json({ message: 'Please enter a valid email address' });
        }

        const existing = await User.findOne({
          where: { email: { [Op.iLike]: normalizedEmail }, id: { [Op.ne]: user.id } },
        });
        if (existing) {
          return res.status(409).json({ message: 'An account with this email already exists' });
        }

        const pendingEmail = await PendingSignup.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });
        if (pendingEmail) {
          return res.status(409).json({ message: 'That email is pending verification on another signup. Please try a different email.' });
        }

        // Only (re)verify when the address actually changes.
        const currentEmail = user.email ? String(user.email).toLowerCase() : '';
        if (normalizedEmail !== currentEmail) {
          updates.email = normalizedEmail;
          updates.isVerified = false;
          updates.verificationToken = crypto.randomBytes(32).toString('hex');
        }
      }
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl === null || avatarUrl === '') {
        updates.avatarUrl = null;
      } else {
        if (typeof avatarUrl !== 'string' || !DATA_URL_REGEX.test(avatarUrl)) {
          return res.status(400).json({ message: 'Avatar must be a PNG, JPEG, WebP, or GIF image' });
        }
        const base64 = avatarUrl.split(',')[1] || '';
        try {
          const decoded = Buffer.from(base64, 'base64');
          if (decoded.length > MAX_AVATAR_BYTES) {
            return res.status(400).json({ message: 'Avatar image is too large. Please use an image under 2 MB.' });
          }
        } catch (err) {
          return res.status(400).json({ message: 'Avatar image data is invalid' });
        }
        updates.avatarUrl = avatarUrl;
      }
    }

    if (Object.keys(updates).length > 0) {
      await user.update(updates);
    }

    const shop = user.shopId
      ? await Shop.findByPk(user.shopId, { attributes: ['id', 'name', 'slug'] })
      : null;

    let verificationEmailSent = false;
    let verificationWarning = null;
    if (updates.email !== undefined && updates.email !== null && updates.verificationToken) {
      try {
        await sendVerificationEmail(updates.email, updates.verificationToken, {
          name: user.name,
          shopName: shop?.name,
        });
        verificationEmailSent = true;
      } catch (emailError) {
        console.error('Failed to send profile verification email:', emailError.message);
        verificationWarning =
          'Your email was saved, but the verification link could not be sent right now. You can resend it from the Profile page.';
      }
    }

    const profile = toProfile(user, shop, {
      emailVerified: user.isVerified,
      verificationPending: Boolean(updates.verificationToken),
      verificationEmailSent,
    });
    if (verificationWarning) {
      profile.message = verificationWarning;
    }

    res.json(profile);
  } catch (error) {
    next(error);
  }
};
