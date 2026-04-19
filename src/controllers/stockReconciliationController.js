const { StockReconciliation, Product, User } = require('../models');
const { Op } = require('sequelize');

// Create stock reconciliation record
exports.createReconciliation = async (req, res) => {
  try {
    const { shopId, id: userId } = req.user;
    const { productId, physicalQuantity, reason, notes } = req.body;

    if (!productId || physicalQuantity === undefined) {
      return res.status(400).json({ message: 'Product ID and physical quantity are required' });
    }

    const product = await Product.findOne({
      where: { id: productId, shopId },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const systemQuantity = product.quantity;
    const variance = physicalQuantity - systemQuantity;

    const reconciliation = await StockReconciliation.create({
      shopId,
      productId,
      systemQuantity,
      physicalQuantity,
      variance,
      reason,
      adjustedByUserId: userId,
      notes,
      reconciliationDate: new Date(),
    });

    // If there's a variance, update the product quantity
    if (variance !== 0) {
      await Product.update(
        { quantity: physicalQuantity },
        { where: { id: productId } }
      );
    }

    res.status(201).json({
      message: 'Stock reconciliation recorded successfully',
      data: reconciliation,
    });
  } catch (error) {
    console.error('Error creating reconciliation:', error);
    res.status(500).json({ message: 'Failed to record reconciliation', error: error.message });
  }
};

// Get reconciliation history
exports.getReconciliations = async (req, res) => {
  try {
    const { shopId } = req.user;
    const { productId, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const where = { shopId };

    if (productId) where.productId = parseInt(productId);

    if (startDate || endDate) {
      where.reconciliationDate = {};
      if (startDate) where.reconciliationDate[Op.gte] = new Date(startDate);
      if (endDate) where.reconciliationDate[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await StockReconciliation.findAndCountAll({
      where,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name'],
        },
        {
          model: User,
          as: 'adjustedBy',
          attributes: ['id', 'name', 'username'],
        },
      ],
      order: [['reconciliationDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      total: count,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching reconciliations:', error);
    res.status(500).json({ message: 'Failed to fetch reconciliations', error: error.message });
  }
};

// Get reconciliation summary by product
exports.getReconciliationSummary = async (req, res) => {
  try {
    const { shopId } = req.user;
    const { startDate, endDate } = req.query;

    const where = { shopId };

    if (startDate || endDate) {
      where.reconciliationDate = {};
      if (startDate) where.reconciliationDate[Op.gte] = new Date(startDate);
      if (endDate) where.reconciliationDate[Op.lte] = new Date(endDate);
    }

    const summary = await StockReconciliation.findAll({
      where,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name'],
        },
      ],
      attributes: [
        'productId',
        [require('sequelize').fn('COUNT', '*'), 'reconciliationCount'],
        [require('sequelize').fn('SUM', require('sequelize').col('variance')), 'totalVariance'],
        [require('sequelize').fn('AVG', require('sequelize').col('variance')), 'avgVariance'],
      ],
      group: ['productId', 'product.id', 'product.name'],
      raw: true,
      subQuery: false,
      order: [[require('sequelize').literal('totalVariance'), 'DESC']],
    });

    res.json(summary);
  } catch (error) {
    console.error('Error fetching reconciliation summary:', error);
    res.status(500).json({ message: 'Failed to fetch reconciliation summary', error: error.message });
  }
};

// Get products for reconciliation (showing current system quantities)
exports.getProductsForReconciliation = async (req, res) => {
  try {
    const { shopId } = req.user;
    const { search } = req.query;

    const where = { shopId };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const products = await Product.findAll({
      where,
      attributes: ['id', 'name', 'quantity', 'buyPrice', 'sellPrice'],
      order: [['name', 'ASC']],
      limit: 100,
    });

    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
};
