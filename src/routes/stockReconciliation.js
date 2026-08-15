const express = require('express');
const router = express.Router();
const stockReconciliationController = require('../controllers/stockReconciliationController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

const adminOnly = authorize(['Admin']);

// Get products available for reconciliation
router.get('/products', authenticate, adminOnly, stockReconciliationController.getProductsForReconciliation);

// Get reconciliation history
router.get('/history', authenticate, adminOnly, stockReconciliationController.getReconciliations);

// Get reconciliation summary
router.get('/summary', authenticate, adminOnly, stockReconciliationController.getReconciliationSummary);

// Create a reconciliation record
router.post('/create', authenticate, adminOnly, stockReconciliationController.createReconciliation);

module.exports = router;
