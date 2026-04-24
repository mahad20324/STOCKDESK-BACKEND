const express = require('express');
const router = express.Router();
const {
  login,
  signup,
  refreshToken,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { createRateLimiter } = require('../middleware/rateLimit');
const { authenticate } = require('../middleware/auth');

const loginRateLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 10,
	message: 'Too many login attempts. Please wait before trying again.',
	keyPrefix: 'auth-login',
});

const signupRateLimiter = createRateLimiter({
	windowMs: 60 * 60 * 1000,
	maxRequests: 5,
	message: 'Too many signup attempts. Please wait before creating another shop.',
	keyPrefix: 'auth-signup',
});

const emailRateLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	maxRequests: 5,
	message: 'Too many requests. Please wait before trying again.',
	keyPrefix: 'auth-email',
});

router.post('/login',                loginRateLimiter,  login);
router.post('/signup',               signupRateLimiter, signup);
router.post('/refresh',              authenticate,      refreshToken);
router.post('/verify-email',         emailRateLimiter,  verifyEmail);
router.post('/resend-verification',  emailRateLimiter,  resendVerification);
router.post('/forgot-password',      emailRateLimiter,  forgotPassword);
router.post('/reset-password',       emailRateLimiter,  resetPassword);

module.exports = router;
