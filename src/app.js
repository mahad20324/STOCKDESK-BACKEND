const express = require('express');
const cors = require('cors');
const packageJson = require('../package.json');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const settingsRoutes = require('./routes/settings');
const reportRoutes = require('./routes/reports');
const printerRoutes = require('./routes/printer');
const adminRoutes = require('./routes/admin');
const expenseRoutes = require('./routes/expenses');
const { errorHandler } = require('./middleware/errorHandler');
const { getRuntimeHealth } = require('./state/runtime');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/api', (req, res) => {
  const health = getRuntimeHealth();

  res.json({
    message: 'Backend is running',
    status: health.status,
    healthPath: '/api/health',
    version: packageJson.version,
  });
});

app.get('/api/health', (req, res) => {
  const health = getRuntimeHealth();
  const statusCode = health.status === 'ready' ? 200 : health.status === 'error' ? 503 : 202;

  res.status(statusCode).json({
    ...health,
    version: packageJson.version,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/printer', printerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/expenses', expenseRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
})

app.use(errorHandler);

module.exports = app;
