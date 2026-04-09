const bcrypt = require('bcrypt');
const { User } = require('../models');
const { normalizeUsername } = require('../utils/username');

const MANAGEABLE_DISPLAY_ROLES = ['Admin', 'Manager', 'Cashier'];

function toDisplayRole(user) {
  const tokenPrefix = typeof user.verificationToken === 'string'
    ? user.verificationToken.split(':', 1)[0]
    : null;

  return ['Admin', 'Manager', 'Cashier'].includes(tokenPrefix)
    ? tokenPrefix
    : (user.role === 'Admin' ? 'Admin' : 'Cashier');
}

function toAccessRole(displayRole) {
  return displayRole === 'Admin' ? 'Admin' : 'Staff';
}

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { shopId: req.user.shopId },
      attributes: ['id', 'name', 'username', 'role', 'createdAt', 'shopId'],
      order: [['createdAt', 'ASC']],
    });
    res.json(users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      displayRole: toDisplayRole(user),
      createdAt: user.createdAt,
      shopId: user.shopId,
    })));
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Username is already in use. Choose a different username.' });
    }
    next(error);
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      attributes: ['id', 'name', 'username', 'role', 'createdAt', 'shopId'],
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      displayRole: toDisplayRole(user),
      createdAt: user.createdAt,
      shopId: user.shopId,
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Username is already in use. Choose a different username.' });
    }
    next(error);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const name = req.body.name ? String(req.body.name).trim() : '';
    const username = normalizeUsername(req.body.username);
    const password = req.body.password ? String(req.body.password) : '';
    const displayRole = req.body.displayRole || req.body.role || 'Cashier';

    if (!name || !username || !password) {
      return res.status(400).json({ message: 'Name, username, and password are required' });
    }
    if (!MANAGEABLE_DISPLAY_ROLES.includes(displayRole)) {
      return res.status(400).json({ message: 'Invalid role selected' });
    }

    const existingUser = await User.findOne({ where: { shopId: req.user.shopId, username } });
    if (existingUser) {
      return res.status(409).json({ message: 'Username is already in use for this shop' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      username,
      email: null,
      password: hash,
      role: toAccessRole(displayRole),
      shopId: req.user.shopId,
      isVerified: true,
      verificationToken: null,
    });

    user.verificationToken = `${displayRole}:${user.id}`;
    await user.save();

    // Return plaintext password to admin only (visible in response)
    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      displayRole,
      shopId: user.shopId,
      plainPassword: password,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, username, displayRole, role } = req.body;
    if (username !== undefined) {
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername) {
        return res.status(400).json({ message: 'Username is required' });
      }
      const existingUser = await User.findOne({
        where: {
          shopId: req.user.shopId,
          username: normalizedUsername,
        },
      });
      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({ message: 'Username is already in use for this shop' });
      }
      user.username = normalizedUsername;
    }
    if (name !== undefined) {
      const normalizedName = String(name).trim();
      if (!normalizedName) {
        return res.status(400).json({ message: 'Name is required' });
      }
      user.name = normalizedName;
    }
    const nextDisplayRole = displayRole || role;
    if (nextDisplayRole) {
      if (!MANAGEABLE_DISPLAY_ROLES.includes(nextDisplayRole)) {
        return res.status(400).json({ message: 'Invalid role selected' });
      }
      user.role = toAccessRole(nextDisplayRole);
      user.verificationToken = `${nextDisplayRole}:${user.id}`;
    }
    await user.save();

    res.json({ id: user.id, name: user.name, username: user.username, role: user.role, displayRole: toDisplayRole(user), shopId: user.shopId });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const password = req.body.password ? String(req.body.password) : '';
    const confirmPassword = req.body.confirmPassword ? String(req.body.confirmPassword) : '';

    if (!password || !confirmPassword) {
      return res.status(400).json({ message: 'Password and confirm password are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    res.json({
      message: 'Password reset successfully.',
      id: user.id,
      username: user.username,
      plainPassword: password,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const destroyed = await User.destroy({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!destroyed) return res.status(404).json({ message: 'User not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

