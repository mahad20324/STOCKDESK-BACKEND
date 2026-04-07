const bcrypt = require('bcrypt');
const { User } = require('../models');
const { generateUniqueUsername, normalizeUsername } = require('../utils/username');

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { shopId: req.user.shopId },
      attributes: ['id', 'name', 'username', 'email', 'role', 'createdAt', 'shopId'],
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      attributes: ['id', 'name', 'username', 'email', 'role', 'createdAt', 'shopId'],
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { name, username, email, password, role } = req.body;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    const resolvedUsername = await generateUniqueUsername(User, {
      username,
      email: normalizedEmail,
      name,
    });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      username: resolvedUsername,
      email: normalizedEmail,
      password: hash,
      role,
      shopId: req.user.shopId,
      isVerified: true,
      verificationToken: null,
    });
    // Return plaintext password to admin only (visible in response)
    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
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

    const { name, username, email, password, role } = req.body;
    if (name) user.name = name.trim();
    if (email) user.email = String(email).trim().toLowerCase();
    if (username !== undefined) {
      user.username = await generateUniqueUsername(
        User,
        {
          username: normalizeUsername(username),
          email: user.email,
          name: user.name,
        },
        user.id
      );
    }
    if (role) user.role = role;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    await user.save();

    res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, shopId: user.shopId });
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

