const { Product, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.listProducts = async (req, res, next) => {
  try {
    const { search, category } = req.query;
    const where = { shopId: req.user.shopId };

    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }
    if (category) {
      where.category = category;
    }

    const products = await Product.findAll({ where, order: [['name', 'ASC']] });
    res.json(products);
  } catch (error) {
    next(error);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    next(error);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const { name, category, buyPrice, sellPrice, quantity, lowStock } = req.body;
    const product = await Product.create({ name, category, buyPrice, sellPrice, quantity, lowStock, shopId: req.user.shopId });
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const updates = req.body;
    await product.update(updates);
    res.json(product);
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const destroyed = await Product.destroy({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!destroyed) return res.status(404).json({ message: 'Product not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

exports.lowStockAlerts = async (req, res, next) => {
  try {
    const products = await Product.findAll({
      where: { shopId: req.user.shopId, quantity: { [Op.lte]: sequelize.col('lowStock') } },
    });
    res.json(products);
  } catch (error) {
    next(error);
  }
};
