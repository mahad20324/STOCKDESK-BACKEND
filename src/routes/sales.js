const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const saleController = require('../controllers/saleController');
const userController = require('../controllers/userController');

router.use(authenticate);

// Admin only: Reset all revenue (must be before :id route)
router.post('/reset-revenue', authorize(['Admin']), userController.resetRevenue);

router.post('/', saleController.createSale);
router.get('/', saleController.listSales);
router.get('/:id', saleController.getSale);
router.get('/:id/receipt', saleController.getSaleReceipt);

module.exports = router;
