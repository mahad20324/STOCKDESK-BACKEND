const { Sale, SaleItem, Product, Receipt, User, Setting, Shop, Customer, DayClosure, SaleReturn, SaleReturnItem } = require('../models');
const { generateReceiptPdf } = require('../utils/receiptGenerator');
const { startOfDay, endOfDay, getMetricsForRange } = require('../utils/businessMetrics');
const { Op } = require('sequelize');

function buildReceiptNumber(id) {
  return `SD-${String(id).padStart(6, '0')}`;
}

exports.createSale = async (req, res, next) => {
  const transaction = await Sale.sequelize.transaction();
  try {
    const { items, paymentMethod, paymentSplits, currency, discount = 0, discountType = 'fixed', customerId = null } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Sale must include at least one item');
    }

    const settings = await Setting.findOne({
      where: { shopId: req.user.shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    });
    const saleCurrency = currency || (settings && settings.currency) || 'USD';

    let customer = null;
    if (customerId) {
      customer = await Customer.findOne({ where: { id: customerId, shopId: req.user.shopId }, transaction });
      if (!customer) {
        throw new Error('Selected customer not found');
      }
    }

    let subtotal = 0;
    const itemRecords = [];

    for (const item of items) {
      const product = await Product.findOne({ where: { id: item.productId, shopId: req.user.shopId }, transaction });
      if (!product) {
        throw new Error(`Product not found`);
      }
      if (product.quantity < item.quantity) {
        const error = new Error(`${product.name} is currently out of stock. Available: ${product.quantity} units, requested: ${item.quantity} units.`);
        error.statusCode = 409;
        throw error;
      }
      const lineTotal = parseFloat(product.sellPrice) * item.quantity;
      subtotal += lineTotal;
      product.quantity -= item.quantity;
      await product.save({ transaction });

      itemRecords.push({ productId: product.id, quantity: item.quantity, price: product.sellPrice });
    }

    let discountAmount = 0;
    if (discountType === 'percentage') {
      discountAmount = (subtotal * discount) / 100;
    } else {
      discountAmount = discount;
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const taxRate = settings ? parseFloat(settings.vat || 0) : 0;
    const taxAmount = (afterDiscount * taxRate) / 100;
    const total = afterDiscount + taxAmount;

    const sale = await Sale.create(
      {
        total,
        discount: discountAmount,
        discountType,
        tax: taxRate,
        taxAmount,
        cashierId: req.user.id,
        customerId: customer ? customer.id : null,
        shopId: req.user.shopId,
        paymentMethod,
        paymentSplits: paymentSplits || null,
        currency: saleCurrency,
      },
      { transaction }
    );

    const saleItems = itemRecords.map((record) => ({ ...record, saleId: sale.id, shopId: req.user.shopId }));
    await SaleItem.bulkCreate(saleItems, { transaction });

    const receiptNumber = buildReceiptNumber(sale.id);
    const receipt = await Receipt.create({ saleId: sale.id, receiptNumber, shopId: req.user.shopId }, { transaction });

    await transaction.commit();

    res.status(201).json({ saleId: sale.id, receipt: receiptNumber, total, discount: discountAmount, taxAmount, currency: saleCurrency });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.listSales = async (req, res, next) => {
  try {
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId },
      include: [
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
        { model: Receipt, as: 'receipt' },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};

exports.getSale = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [
        {
          model: SaleItem,
          as: 'items',
          where: { shopId: req.user.shopId },
          required: false,
          include: [{ model: Product, attributes: ['id', 'name', 'sellPrice'] }],
        },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
        { model: Receipt, as: 'receipt' },
      ],
    });
    
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    res.json(sale);
  } catch (error) {
    next(error);
  }
};

exports.getSaleReceipt = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [
        {
          model: SaleItem,
          as: 'items',
          where: { shopId: req.user.shopId },
          required: false,
          include: [{ model: Product, attributes: ['name'] }],
        },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
        { model: Receipt, as: 'receipt' },
      ],
    });
    const settings = await Setting.findOne({
      where: { shopId: req.user.shopId },
      include: [{ model: Shop, as: 'shop', attributes: ['id', 'name', 'slug'] }],
    });
    
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=receipt-${sale.id}.pdf`);
    
    await generateReceiptPdf(res, sale, settings);
  } catch (error) {
    console.error('Receipt generation error:', error);
    next(error);
  }
};

exports.closeBusinessDay = async (req, res, next) => {
  try {
    const now = new Date();
    const closureDate = startOfDay(now).toISOString().slice(0, 10);
    const existingClosure = await DayClosure.findOne({
      where: { shopId: req.user.shopId, closedForDate: closureDate },
      include: [{ model: User, as: 'closedBy', attributes: ['id', 'name'] }],
    });

    if (existingClosure) {
      return res.status(200).json({
        message: 'Business day was already closed for today.',
        closure: existingClosure,
        alreadyClosed: true,
      });
    }

    const metrics = await getMetricsForRange(req.user.shopId, startOfDay(now), endOfDay(now));
    const closure = await DayClosure.create({
      closedForDate: closureDate,
      closedByUserId: req.user.id,
      shopId: req.user.shopId,
      netSales: metrics.netSales,
      grossSales: metrics.grossSales,
      grossProfit: metrics.grossProfit,
      itemsSold: metrics.itemsSold,
      orderCount: metrics.orderCount,
      discountTotal: metrics.discountTotal,
    });

    const savedClosure = await DayClosure.findByPk(closure.id, {
      include: [{ model: User, as: 'closedBy', attributes: ['id', 'name'] }],
    });

    res.status(201).json({
      message: 'Business day closed successfully. Sales history remains available for reporting.',
      closure: savedClosure,
      alreadyClosed: false,
    });
  } catch (error) {
    next(error);
  }
};

exports.listDayClosures = async (req, res, next) => {
  try {
    const closures = await DayClosure.findAll({
      where: { shopId: req.user.shopId },
      include: [{ model: User, as: 'closedBy', attributes: ['id', 'name'] }],
      order: [['closedForDate', 'DESC'], ['createdAt', 'DESC']],
      limit: 10,
    });
    res.json(closures);
  } catch (error) {
    next(error);
  }
};

exports.createReturn = async (req, res, next) => {
  const transaction = await Sale.sequelize.transaction();
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [{ model: SaleItem, as: 'items' }],
      transaction,
    });
    if (!sale) { await transaction.rollback(); return res.status(404).json({ message: 'Sale not found' }); }

    const { items, reason } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No items specified' });
    }

    let totalRefund = 0;
    for (const item of items) {
      const saleItem = sale.items.find((si) => si.productId === item.productId);
      if (!saleItem || item.quantity > saleItem.quantity) {
        await transaction.rollback();
        return res.status(400).json({ message: `Invalid return quantity for product ${item.productId}` });
      }
      const product = await Product.findByPk(item.productId, { transaction });
      if (product) { product.quantity += item.quantity; await product.save({ transaction }); }
      totalRefund += Number(saleItem.price) * item.quantity;
    }

    const saleReturn = await SaleReturn.create({
      saleId: sale.id, reason, totalRefund, processedByUserId: req.user.id, shopId: req.user.shopId,
    }, { transaction });

    await SaleReturnItem.bulkCreate(
      items.map((item) => ({ returnId: saleReturn.id, productId: item.productId, quantity: item.quantity, refundAmount: 0, shopId: req.user.shopId })),
      { transaction }
    );

    await transaction.commit();
    res.status(201).json({ message: 'Return processed', totalRefund });
  } catch (err) { await transaction.rollback(); next(err); }
};

exports.listReturns = async (req, res, next) => {
  try {
    const returns = await SaleReturn.findAll({
      where: { shopId: req.user.shopId },
      include: [
        { model: SaleReturnItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] },
        { model: User, as: 'processedBy', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(returns);
  } catch (err) { next(err); }
};
