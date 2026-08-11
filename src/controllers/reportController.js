const { Sale, SaleItem, Product, User, Expense } = require('../models');
const { fn, col, Op } = require('sequelize');
const { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getMetricsForRange } = require('../utils/businessMetrics');

function buildComparison(currentValue, previousValue) {
  const delta = currentValue - previousValue;
  const percentChange = previousValue === 0 ? (currentValue === 0 ? 0 : 100) : (delta / previousValue) * 100;

  return {
    current: currentValue,
    previous: previousValue,
    delta,
    percentChange,
  };
}

exports.summary = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const yesterdayDate = new Date(todayStart);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStart = startOfDay(yesterdayDate);
    const yesterdayEnd = endOfDay(yesterdayDate);

    const thisWeekStart = startOfWeek(now);
    const thisWeekEnd = endOfWeek(now);
    const lastWeekDate = new Date(thisWeekStart);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeekStart = startOfWeek(lastWeekDate);
    const lastWeekEnd = endOfWeek(lastWeekDate);

    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStart = startOfMonth(lastMonthDate);
    const lastMonthEnd = endOfMonth(lastMonthDate);

    const [today, yesterday, thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
      getMetricsForRange(req.user.shopId, todayStart, todayEnd),
      getMetricsForRange(req.user.shopId, yesterdayStart, yesterdayEnd),
      getMetricsForRange(req.user.shopId, thisWeekStart, thisWeekEnd),
      getMetricsForRange(req.user.shopId, lastWeekStart, lastWeekEnd),
      getMetricsForRange(req.user.shopId, thisMonthStart, thisMonthEnd),
      getMetricsForRange(req.user.shopId, lastMonthStart, lastMonthEnd),
    ]);

    res.json({
      periods: {
        today,
        yesterday,
        thisWeek,
        lastWeek,
        thisMonth,
        lastMonth,
      },
      comparisons: {
        todayVsYesterday: {
          netSales: buildComparison(today.netSales, yesterday.netSales),
          grossProfit: buildComparison(today.grossProfit, yesterday.grossProfit),
          itemsSold: buildComparison(today.itemsSold, yesterday.itemsSold),
        },
        thisWeekVsLastWeek: {
          netSales: buildComparison(thisWeek.netSales, lastWeek.netSales),
          grossProfit: buildComparison(thisWeek.grossProfit, lastWeek.grossProfit),
          itemsSold: buildComparison(thisWeek.itemsSold, lastWeek.itemsSold),
        },
        thisMonthVsLastMonth: {
          netSales: buildComparison(thisMonth.netSales, lastMonth.netSales),
          grossProfit: buildComparison(thisMonth.grossProfit, lastMonth.grossProfit),
          itemsSold: buildComparison(thisMonth.itemsSold, lastMonth.itemsSold),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.dailySales = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId, createdAt: { [Op.gte]: today } },
      order: [['createdAt', 'DESC']],
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};

exports.monthlySales = async (req, res, next) => {
  try {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId, createdAt: { [Op.gte]: start } },
      order: [['createdAt', 'DESC']],
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};

exports.bestSelling = async (req, res, next) => {
  try {
    const best = await SaleItem.findAll({
      where: { shopId: req.user.shopId },
      attributes: ['productId', [fn('SUM', col('SaleItem.quantity')), 'unitsold']],
      include: [{ model: Product, attributes: ['id', 'name'], where: { shopId: req.user.shopId } }],
      group: ['SaleItem.productId', 'Product.id'],
      order: [[fn('SUM', col('SaleItem.quantity')), 'DESC']],
      limit: 10,
    });
    res.json(best);
  } catch (error) {
    next(error);
  }
};

exports.salesByCashier = async (req, res, next) => {
  try {
    const report = await Sale.findAll({
      where: { shopId: req.user.shopId },
      attributes: ['cashierId', [fn('SUM', col('Sale.total')), 'revenue'], [fn('COUNT', col('Sale.id')), 'salesCount']],
      include: [{ model: User, as: 'cashier', attributes: ['name'], where: { shopId: req.user.shopId } }],
      group: ['Sale.cashierId', 'cashier.id'],
    });
    res.json(report);
  } catch (error) {
    next(error);
  }
};

exports.rangeReport = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'start and end query params required' });

    const rangeStart = startOfDay(new Date(start));
    const rangeEnd = endOfDay(new Date(end));

    const [metrics, sales, topProducts] = await Promise.all([
      getMetricsForRange(req.user.shopId, rangeStart, rangeEnd),
      Sale.findAll({
        where: { shopId: req.user.shopId, createdAt: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd } },
        include: [
          { model: User, as: 'cashier', attributes: ['id', 'name'] },
          { model: SaleItem, as: 'items', required: false, include: [{ model: Product, attributes: ['id', 'name', 'buyPrice'] }] },
        ],
        order: [['createdAt', 'DESC']],
      }),
      SaleItem.findAll({
        where: { shopId: req.user.shopId },
        attributes: ['productId', [fn('SUM', col('SaleItem.quantity')), 'unitsSold'], [fn('SUM', col('SaleItem.price')), 'revenue']],
        include: [
          { model: Sale, attributes: [], where: { shopId: req.user.shopId, createdAt: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd } }, required: true },
          { model: Product, attributes: ['id', 'name', 'buyPrice'], required: false },
        ],
        group: ['SaleItem.productId', 'Product.id'],
        order: [[fn('SUM', col('SaleItem.quantity')), 'DESC']],
        limit: 10,
      }),
    ]);

    const expensesInRange = await Expense.findAll({
      where: { shopId: req.user.shopId, date: { [Op.gte]: start, [Op.lte]: end } },
    });
    const totalExpenses = expensesInRange.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    res.json({ metrics, sales, topProducts, totalExpenses, start, end });
  } catch (error) {
    next(error);
  }
};

exports.customerSales = async (req, res, next) => {
  try {
    const sales = await Sale.findAll({
      where: { shopId: req.user.shopId, customerId: req.params.customerId },
      include: [
        { model: SaleItem, as: 'items', required: false, include: [{ model: Product, attributes: ['id', 'name'] }] },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    res.json(sales);
  } catch (error) {
    next(error);
  }
};
