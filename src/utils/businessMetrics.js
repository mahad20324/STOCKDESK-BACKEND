const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

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

async function getMetricsForRange(shopId, start, end) {
  try {
    const rows = await sequelize.query(
      `SELECT
         COALESCE(SUM(s."total"), 0) AS "netSales",
         COALESCE(SUM(s."total" + s."discount"), 0) AS "grossSales",
         COALESCE(SUM(si."costOfGoods"), 0) AS "costOfGoods",
         COALESCE(si_sum."itemsSold", 0) AS "itemsSold",
         COUNT(s.id)::int AS "orderCount",
         COALESCE(SUM(s."discount"), 0) AS "discountTotal"
       FROM "sales" s
       LEFT JOIN (
         SELECT si2."saleId",
                SUM(COALESCE(p."buyPrice", 0) * si2."quantity") AS "costOfGoods",
                SUM(si2."quantity") AS "itemsSold"
         FROM "sale_items" si2
         LEFT JOIN "products" p ON p.id = si2."productId"
         WHERE si2."shopId" = :shopId
         GROUP BY si2."saleId"
       ) si ON si."saleId" = s.id
       LEFT JOIN (
         SELECT SUM("quantity") AS "itemsSold"
         FROM "sale_items"
         WHERE "shopId" = :shopId
       ) si_sum ON true
       WHERE s."shopId" = :shopId
         AND s."createdAt" >= :start
         AND s."createdAt" <= :end`,
      {
        replacements: { shopId, start, end },
        type: QueryTypes.SELECT,
      }
    );

    const row = rows[0] || {};
    const netSales = Number(row.netSales) || 0;
    const grossSales = Number(row.grossSales) || 0;
    const costOfGoods = Number(row.costOfGoods) || 0;

    return {
      netSales,
      grossSales,
      grossProfit: netSales - costOfGoods,
      itemsSold: Number(row.itemsSold) || 0,
      orderCount: Number(row.orderCount) || 0,
      discountTotal: Number(row.discountTotal) || 0,
    };
  } catch (error) {
    console.error('getMetricsForRange failed:', error.message);
    return createEmptyMetrics();
  }
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
