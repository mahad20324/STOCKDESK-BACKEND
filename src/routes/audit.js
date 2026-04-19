const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

// Get audit logs (Admin, Manager, Owner)
router.get('/logs', authenticate, authorize('Admin', 'Manager', 'Owner'), auditController.getAuditLogs);

// Get audit users for filter dropdown
router.get('/users', authenticate, authorize('Admin', 'Manager', 'Owner'), auditController.getAuditUsers);

// Get audit statistics
router.get('/stats', authenticate, authorize('Admin', 'Manager', 'Owner'), auditController.getAuditStats);

module.exports = router;
