const express = require('express');
const router = express.Router();
const { login, signup } = require('../controllers/authController');
const { createRateLimiter } = require('../middleware/rateLimit');

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

router.post('/login', loginRateLimiter, login);
router.post('/signup', signupRateLimiter, signup);

module.exports = router;
