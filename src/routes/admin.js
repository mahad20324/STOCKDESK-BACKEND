const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(authenticate, authorize(['SuperAdmin']));
router.get('/overview', adminController.getOverview);
router.get('/dashboard', adminController.getDashboard);
router.get('/shops/:id', adminController.getShopDetail);
router.delete('/shops/:id', adminController.deleteShop);

module.exports = router;