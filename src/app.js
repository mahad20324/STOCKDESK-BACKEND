const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const settingsRoutes = require('./routes/settings');
const reportRoutes = require('./routes/reports');
const printerRoutes = require('./routes/printer');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

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

app.get('/api', (req, res) => {
  res.json({ message: 'Backend is running', status: 'OK' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/printer', printerRoutes);

app.use(errorHandler);

module.exports = app;
