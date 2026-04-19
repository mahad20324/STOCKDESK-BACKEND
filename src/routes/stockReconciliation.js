const express = require('express');
const router = express.Router();
const stockReconciliationController = require('../controllers/stockReconciliationController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

// Get products available for reconciliation
router.get('/products', authenticate, authorize('Admin', 'Manager', 'Owner'), stockReconciliationController.getProductsForReconciliation);

// Get reconciliation history
router.get('/history', authenticate, authorize('Admin', 'Manager', 'Owner'), stockReconciliationController.getReconciliations);

// Get reconciliation summary
router.get('/summary', authenticate, authorize('Admin', 'Manager', 'Owner'), stockReconciliationController.getReconciliationSummary);

// Create a reconciliation record
router.post('/create', authenticate, authorize('Admin', 'Manager', 'Owner'), stockReconciliationController.createReconciliation);

module.exports = router;
