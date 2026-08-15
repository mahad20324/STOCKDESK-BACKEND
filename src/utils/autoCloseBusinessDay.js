const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../config/db');
const { Shop, User, DayClosure } = require('../models');
const { startOfDay, endOfDay, getMetricsForRange } = require('./businessMetrics');

let running = false;

function formatDate(raw) {
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  return String(raw).slice(0, 10);
}

async function closeMissingDaysForShop(shopId, existingDates, now) {
  const admin = await User.findOne({
    where: { shopId, role: { [Op.in]: ['SuperAdmin', 'Admin'] } },
    order: [['id', 'ASC']],
    attributes: ['id'],
  });
  if (!admin) return 0;

  const rows = await sequelize.query(
    `SELECT DISTINCT to_char("createdAt", 'YYYY-MM-DD') AS "d"
       FROM "sales"
      WHERE "shopId" = :shopId AND "createdAt" < :today`,
    { replacements: { shopId, today: startOfDay(now) }, type: QueryTypes.SELECT }
  );

  let created = 0;
  for (const row of rows) {
    const dateStr = String(row.d);
    if (existingDates.has(dateStr)) continue;

    const dayStart = startOfDay(new Date(`${dateStr}T00:00:00`));
    const dayEnd = endOfDay(new Date(`${dateStr}T00:00:00`));
    const metrics = await getMetricsForRange(shopId, dayStart, dayEnd);

    try {
      await DayClosure.create({
        closedForDate: dateStr,
        closedByUserId: admin.id,
        shopId,
        ...metrics,
      });
      created += 1;
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    }
  }
  return created;
}

async function autoCloseBusinessDays() {
  if (running) return 0;
  running = true;
  let totalCreated = 0;
  try {
    const now = new Date();
    const shops = await Shop.findAll({ attributes: ['id'] });
    for (const shop of shops) {
      const closures = await DayClosure.findAll({
        where: { shopId: shop.id },
        attributes: ['closedForDate'],
      });
      const existing = new Set(closures.map((c) => formatDate(c.closedForDate)));
      totalCreated += await closeMissingDaysForShop(shop.id, existing, now);
    }
    if (totalCreated > 0) {
      console.log(`[auto-close] Created ${totalCreated} automatic business day closure(s)`);
    }
  } catch (error) {
    console.error('[auto-close] Failed:', error.message);
  } finally {
    running = false;
  }
  return totalCreated;
}

function startAutoCloseScheduler({ intervalMs = 5 * 60 * 1000 } = {}) {
  const run = () => {
    autoCloseBusinessDays().catch(() => {});
  };
  setTimeout(run, 10 * 1000);
  const timer = setInterval(run, intervalMs);
  if (timer.unref) timer.unref();
  console.log(`[auto-close] Scheduler started (every ${Math.round(intervalMs / 1000)}s)`);
}

module.exports = { autoCloseBusinessDays, startAutoCloseScheduler };
