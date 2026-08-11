const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const settingsRoutes = require('./routes/settings');
const shopsRoutes = require('./routes/shops');
const reportRoutes = require('./routes/reports');
const printerRoutes = require('./routes/printer');
const adminRoutes = require('./routes/admin');
const expenseRoutes = require('./routes/expenses');
const auditRoutes = require('./routes/audit');
const stockReconciliationRoutes = require('./routes/stockReconciliation');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust Railway / Vercel / any reverse proxy — needed so rate limiter
// uses the real client IP (from X-Forwarded-For) instead of the proxy IP.
// Without this, all users share one rate-limit bucket and one person's failed
// attempts will block everyone.
app.set('trust proxy', 1);

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function patternToRegex(pattern) {
  return new RegExp(`^${escapeRegex(pattern).replace(/\*/g, '.*')}$`);
}

function getAllowedOrigins() {
  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0
    ? configuredOrigins
    : ['http://localhost:5173', 'http://localhost:3000'];
}

function getAllowedOriginPatterns() {
  return (process.env.CORS_ORIGIN_PATTERNS || '')
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map(patternToRegex);
}

function isOriginAllowed(origin) {
  const allowedOrigins = getAllowedOrigins();
  const allowedPatterns = getAllowedOriginPatterns();

  return allowedOrigins.includes(origin) || allowedPatterns.some((pattern) => pattern.test(origin));
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Rate limiting — generous limits to avoid blocking legitimate users
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many signup attempts. Please wait before trying again.' },
  skipSuccessfulRequests: true, // only count failed attempts
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait before trying again.' },
  skipSuccessfulRequests: true,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait before trying again.' },
});

app.get('/api', (req, res) => {
  res.json({ message: 'Backend is running', status: 'OK' });
});

// Apply rate limiters to specific auth routes before the router
app.post('/api/auth/signup', signupLimiter);
app.post('/api/auth/login', loginLimiter);
app.post('/api/auth/forgot-password', authLimiter);
app.post('/api/auth/resend-verification', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/shops', shopsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/printer', printerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/stock-reconciliation', stockReconciliationRoutes);

app.use(errorHandler);

module.exports = app;
