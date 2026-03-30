const express = require('express');
const router = express.Router();
const { login, signup, verifyEmail } = require('../controllers/authController');

router.post('/login', login);
router.post('/signup', signup);
router.get('/verify-email', verifyEmail);

module.exports = router;
