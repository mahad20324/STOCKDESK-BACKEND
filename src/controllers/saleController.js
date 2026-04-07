const { Sale, SaleItem, Product, Receipt, User, Setting, Shop, Customer, DayClosure } = require('../models');
const { generateReceiptPdf } = require('../utils/receiptGenerator');
const { startOfDay, endOfDay, getMetricsForRange } = require('../utils/businessMetrics');
const { Op } = require('sequelize');

function buildReceiptNumber(id) {
  return `SD-${String(id).padStart(6, '0')}`;
}

exports.createSale = async (req, res, next) => {
  const transaction = await Sale.sequelize.transaction();
  try {
    const { items, paymentMethod, currency, discount = 0, discountType = 'fixed', customerId = null } = req.body;
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
        throw new Error(`Product ${item.productId} not found`);
      }
      if (product.quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
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

    const total = Math.max(0, subtotal - discountAmount);

    const sale = await Sale.create(
      {
        total,
        discount: discountAmount,
        discountType,
        cashierId: req.user.id,
        customerId: customer ? customer.id : null,
        shopId: req.user.shopId,
        paymentMethod,
        currency: saleCurrency,
      },
      { transaction }
    );

    const saleItems = itemRecords.map((record) => ({ ...record, saleId: sale.id, shopId: req.user.shopId }));
    await SaleItem.bulkCreate(saleItems, { transaction });

    const receiptNumber = buildReceiptNumber(sale.id);
    const receipt = await Receipt.create({ saleId: sale.id, receiptNumber, shopId: req.user.shopId }, { transaction });

    await transaction.commit();

    res.status(201).json({ saleId: sale.id, receipt: receiptNumber, total, discount: discountAmount, currency: saleCurrency });
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
