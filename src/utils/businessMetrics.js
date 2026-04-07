const { Op } = require('sequelize');
const { Sale, SaleItem, Product } = require('../models');

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfWeek(date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

function endOfWeek(date) {
  const value = startOfWeek(date);
  value.setDate(value.getDate() + 6);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function createEmptyMetrics() {
  return {
    netSales: 0,
    grossSales: 0,
    grossProfit: 0,
    itemsSold: 0,
    orderCount: 0,
    discountTotal: 0,
  };
}

function toNumber(value) {
  return Number(value || 0);
}

async function getMetricsForRange(shopId, start, end) {
  const sales = await Sale.findAll({
    where: {
      shopId,
      createdAt: {
        [Op.gte]: start,
        [Op.lte]: end,
      },
    },
    include: [
      {
        model: SaleItem,
        as: 'items',
        required: false,
        where: { shopId },
        include: [{ model: Product, attributes: ['buyPrice'], required: false }],
      },
    ],
  });

  return sales.reduce((summary, sale) => {
    const netSale = toNumber(sale.total);
    const discount = toNumber(sale.discount);
    const costOfGoods = (sale.items || []).reduce(
      (itemSum, item) => itemSum + toNumber(item.Product?.buyPrice) * toNumber(item.quantity),
      0
    );
    const itemsSold = (sale.items || []).reduce((itemSum, item) => itemSum + toNumber(item.quantity), 0);

    summary.netSales += netSale;
    summary.grossSales += netSale + discount;
    summary.grossProfit += netSale - costOfGoods;
    summary.itemsSold += itemsSold;
    summary.orderCount += 1;
    summary.discountTotal += discount;

    return summary;
  }, createEmptyMetrics());
}

module.exports = {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  createEmptyMetrics,
  getMetricsForRange,
};