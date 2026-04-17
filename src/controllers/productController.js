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
    
    // Validation layer
    const validationErrors = [];
    if (!name || name.trim().length === 0) {
      validationErrors.push('Product name is required');
    }
    if (sellPrice === undefined || sellPrice === null || sellPrice === '') {
      validationErrors.push('Selling price is required');
    } else if (isNaN(parseFloat(sellPrice)) || parseFloat(sellPrice) < 0) {
      validationErrors.push('Selling price must be a valid positive number');
    }
    if (buyPrice === undefined || buyPrice === null || buyPrice === '') {
      validationErrors.push('Buying price is required');
    } else if (isNaN(parseFloat(buyPrice)) || parseFloat(buyPrice) < 0) {
      validationErrors.push('Buying price must be a valid positive number');
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({ message: validationErrors.join('; ') });
    }
    
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
