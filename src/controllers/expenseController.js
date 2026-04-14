const { Expense } = require('../models');
const { Op } = require('sequelize');

exports.listExpenses = async (req, res, next) => {
  try {
    const where = { shopId: req.user.shopId };
    if (req.query.start && req.query.end) {
      where.date = { [Op.between]: [req.query.start, req.query.end] };
    }
    const expenses = await Expense.findAll({ where, order: [['date', 'DESC']] });
    res.json(expenses);
  } catch (err) { next(err); }
};

exports.createExpense = async (req, res, next) => {
  try {
    const { category, description, amount, date, notes } = req.body;
    const expense = await Expense.create({
      category, description, amount, date, notes,
      recordedByUserId: req.user.id,
      shopId: req.user.shopId,
    });
    res.status(201).json(expense);
  } catch (err) { next(err); }
};

exports.updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    await expense.update(req.body);
    res.json(expense);
  } catch (err) { next(err); }
};

exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    await expense.destroy();
    res.json({ message: 'Expense deleted' });
  } catch (err) { next(err); }
};
