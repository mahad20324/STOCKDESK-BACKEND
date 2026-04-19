const { StockIn, Product, User } = require('../models');
const { logAction } = require('./auditController');

exports.restockProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const { quantity, costPrice, supplier, notes } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ message: 'Quantity must be positive' });
    product.quantity = Number(product.quantity) + Number(quantity);
    if (costPrice) product.buyPrice = costPrice;
    await product.save();
    const stockIn = await StockIn.create({
      productId: product.id,
      quantity: Number(quantity),
      costPrice: costPrice || null,
      supplier: supplier || null,
      notes: notes || null,
      addedByUserId: req.user.id,
      shopId: req.user.shopId,
    });
    logAction(req.user.id, req.user.shopId, 'CREATE', 'STOCK_IN', stockIn.id, {
      productId: product.id,
      productName: product.name,
      quantity,
      supplier: supplier || null,
    }, req);
    res.json({ message: 'Stock updated', product });
  } catch (err) { next(err); }
};

exports.stockHistory = async (req, res, next) => {
  try {
    const history = await StockIn.findAll({
      where: { productId: req.params.id, shopId: req.user.shopId },
      include: [{ model: User, as: 'addedBy', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });
    res.json(history);
  } catch (err) { next(err); }
};
