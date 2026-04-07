const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const saleController = require('../controllers/saleController');
const userController = require('../controllers/userController');

router.use(authenticate);

router.get('/day-closures', authorize(['Admin']), saleController.listDayClosures);
router.post('/close-day', authorize(['Admin']), saleController.closeBusinessDay);

router.post('/', saleController.createSale);
router.get('/', saleController.listSales);
router.get('/:id', saleController.getSale);
router.get('/:id/receipt', saleController.getSaleReceipt);

module.exports = router;
