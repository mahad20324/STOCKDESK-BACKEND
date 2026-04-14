const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const expenseController = require('../controllers/expenseController');

router.use(authenticate);
router.get('/', expenseController.listExpenses);
router.post('/', authorize(['Admin']), expenseController.createExpense);
router.put('/:id', authorize(['Admin']), expenseController.updateExpense);
router.delete('/:id', authorize(['Admin']), expenseController.deleteExpense);

module.exports = router;
