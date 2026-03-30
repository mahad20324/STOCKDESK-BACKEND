const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const productController = require('../controllers/productController');

router.get('/', authenticate, productController.listProducts);
router.get('/low-stock', authenticate, productController.lowStockAlerts);
router.get('/:id', authenticate, productController.getProduct);
router.post('/', authenticate, authorize(['Admin']), productController.createProduct);
router.put('/:id', authenticate, authorize(['Admin']), productController.updateProduct);
router.delete('/:id', authenticate, authorize(['Admin']), productController.deleteProduct);

module.exports = router;
