const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const settingsController = require('../controllers/settingsController');

router.use(authenticate);
router.get('/', settingsController.getSettings);
router.put('/', authorize(['Admin']), settingsController.updateSettings);

module.exports = router;
