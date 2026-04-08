const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(authenticate, authorize(['SuperAdmin']));
router.get('/overview', adminController.getOverview);
router.get('/shops', adminController.listShops);

module.exports = router;