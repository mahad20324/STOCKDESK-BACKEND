const express = require('express');
const cors = require('cors');
const { getPrinterService } = require('../src/services/printerService');

const app = express();
const printerService = getPrinterService();
const PORT = Number(process.env.PRINTER_BRIDGE_PORT || 4100);
const BRIDGE_API_KEY = String(process.env.PRINTER_BRIDGE_KEY || '').trim();

function parseAllowedOrigins() {
  return String(process.env.PRINTER_BRIDGE_CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  const radix = normalized.startsWith('0x') ? 16 : 10;
  const parsed = Number.parseInt(normalized, radix);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return parsed;
}

function validateBridgeKey(req, res, next) {
  if (!BRIDGE_API_KEY) {
    return next();
  }

  if (req.headers['x-printer-bridge-key'] !== BRIDGE_API_KEY) {
    return res.status(401).json({ message: 'Invalid printer bridge key' });
  }

  return next();
}

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = parseAllowedOrigins();

    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by printer bridge CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(validateBridgeKey);

app.get('/health', (req, res) => {
  res.json({
    status: 'ready',
    printer: printerService.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/printer/status', (req, res) => {
  res.json(printerService.getStatus());
});

app.post('/printer/configure', async (req, res) => {
  try {
    const { type, vendorId, productId, ip, port } = req.body || {};

    if (!type || !['usb', 'network'].includes(type)) {
      return res.status(400).json({ message: 'Printer type must be usb or network' });
    }

    const settings = { type };

    if (type === 'usb') {
      settings.vendorId = normalizeNumber(vendorId, 0x04b8);
      settings.productId = normalizeNumber(productId, 0x0202);
    } else {
      if (!ip) {
        return res.status(400).json({ message: 'IP address is required for network printers' });
      }

      settings.ip = String(ip).trim();
      settings.port = normalizeNumber(port, 9100);
    }

    await printerService.connect(settings);

    return res.json({
      success: true,
      message: `Printer configured successfully (${type})`,
      status: printerService.getStatus(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to configure printer' });
  }
});

app.post('/printer/test', async (req, res) => {
  try {
    await printerService.testPrint();
    return res.json({ success: true, message: 'Test print sent' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Test print failed' });
  }
});

app.post('/printer/print-receipt', async (req, res) => {
  try {
    const { saleData, settings } = req.body || {};

    if (!saleData || !Array.isArray(saleData.items) || saleData.items.length === 0) {
      return res.status(400).json({ message: 'saleData with items is required' });
    }

    await printerService.printReceipt(saleData, settings || {});
    return res.json({ success: true, message: 'Receipt printed successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to print receipt' });
  }
});

app.post('/printer/disconnect', (req, res) => {
  printerService.disconnect();
  return res.json({ success: true, message: 'Printer disconnected' });
});

app.listen(PORT, () => {
  console.log(`StockDesk printer bridge listening on http://0.0.0.0:${PORT}`);
});