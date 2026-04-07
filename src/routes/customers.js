const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const customerController = require('../controllers/customerController');

router.get('/', authenticate, customerController.listCustomers);
router.get('/:id', authenticate, customerController.getCustomer);
router.post('/', authenticate, authorize(['Admin', 'Manager', 'Cashier']), customerController.createCustomer);
router.put('/:id', authenticate, authorize(['Admin', 'Manager', 'Cashier']), customerController.updateCustomer);
router.delete('/:id', authenticate, authorize(['Admin', 'Manager']), customerController.deleteCustomer);

module.exports = router;