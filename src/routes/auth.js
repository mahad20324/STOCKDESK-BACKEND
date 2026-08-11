const express = require('express');
const router = express.Router();
const { login, signup, verifyEmail, resendVerification, forgotPassword, resetPassword } = require('../controllers/authController');

router.post('/login', login);
router.post('/signup', signup);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
