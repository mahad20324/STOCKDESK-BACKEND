const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const Sale = require('../models/sale');
const Receipt = require('../models/receipt');
const User = require('../models/user');
const Product = require('../models/product');
const Setting = require('../models/setting');
const { getPrinterService } = require('../services/printerService');

/**
 * Configure printer connection
 * POST /api/printer/configure
 */
router.post('/configure', authenticate, authorize(['Admin']), async (req, res) => {
  try {
    const { type, vendorId, productId, ip, port } = req.body;

    if (!type || !['usb', 'network'].includes(type)) {
      return res.status(400).json({ error: 'Invalid printer type. Must be "usb" or "network"' });
    }

    const printerService = getPrinterService();

    // Prepare settings based on type
    const settings = { type };
    if (type === 'usb') {
      settings.vendorId = vendorId || 0x04b8; // Default Epson vendor ID
      settings.productId = productId || 0x0202; // Default Epson product ID
    } else if (type === 'network') {
      if (!ip || !port) {
        return res.status(400).json({ error: 'IP and port required for network printer' });
      }
      settings.ip = ip;
      settings.port = parseInt(port);
    }

    // Try to connect
    await printerService.connect(settings);

    res.json({
      success: true,
      message: `Printer configured successfully (${type})`,
      status: printerService.getStatus(),
    });
  } catch (error) {
    console.error('Printer configuration error:', error);
    res.status(500).json({
      error: 'Failed to configure printer',
      message: error.message,
    });
  }
});

/**
 * Get printer status
 * GET /api/printer/status
 */
router.get('/status', authenticate, (req, res) => {
  try {
    const printerService = getPrinterService();
    const status = printerService.getStatus();

    res.json({
      connected: status.connected,
      type: status.type,
      width: status.width,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get printer status' });
  }
});

/**
 * Test print
 * POST /api/printer/test
 */
router.post('/test', authenticate, authorize(['Admin']), async (req, res) => {
  try {
    const printerService = getPrinterService();

    if (!printerService.isConnected()) {
      return res.status(400).json({ error: 'Printer not connected. Please configure first.' });
    }

    await printerService.testPrint();

    res.json({
      success: true,
      message: 'Test print sent to printer',
    });
  } catch (error) {
    console.error('Test print error:', error);
    res.status(500).json({
      error: 'Test print failed',
      message: error.message,
    });
  }
});

/**
 * Print receipt directly to thermal printer
 * POST /api/printer/print-receipt
 */
router.post('/print-receipt', authenticate, async (req, res) => {
  try {
    const { saleId } = req.body;

    if (!saleId) {
      return res.status(400).json({ error: 'saleId is required' });
    }

    const printerService = getPrinterService();

    if (!printerService.isConnected()) {
      return res.status(400).json({
        error: 'Printer not connected',
        fallback: true, // Signal frontend to use window.print()
      });
    }

    // Fetch sale with items and product details
    const sale = await Sale.findByPk(saleId, {
      include: [
        {
          association: 'items',
          attributes: ['productId', 'price', 'quantity'],
          include: [
            {
              association: 'Product',
              attributes: ['name'],
            },
          ],
        },
        {
          association: 'cashier',
          attributes: ['username'],
        },
      ],
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Fetch receipt number
    const receipt = await Receipt.findOne({
      where: { saleId },
      attributes: ['receiptNumber'],
    });

    // Fetch settings for shop info
    const settings = await Setting.findOne();

    // Prepare print data
    const printData = {
      receiptNumber: receipt?.receiptNumber || `#${saleId}`,
      items: sale.items.map((item) => ({
        name: item.Product?.name || 'Unknown',
        price: item.price,
        quantity: item.quantity,
      })),
      subtotal: parseFloat(sale.total) + parseFloat(sale.discount || 0),
      discount: sale.discount || 0,
      discountType: sale.discountType,
      total: sale.total,
      currency: sale.currency || 'USD',
      paymentMethod: sale.paymentMethod,
      cashierName: sale.cashier?.username || 'Unknown',
      shopName: settings?.shopName || 'StockDesk',
      address: settings?.address || '',
      phone: settings?.phone || '',
    };

    // Print to thermal printer
    await printerService.printReceipt(printData, {
      shopName: printData.shopName,
      address: printData.address,
      phone: printData.phone,
    });

    res.json({
      success: true,
      message: 'Receipt printed successfully',
    });
  } catch (error) {
    console.error('Print receipt error:', error);
    res.status(500).json({
      error: 'Failed to print receipt',
      message: error.message,
      fallback: true, // Signal frontend to use window.print()
    });
  }
});

/**
 * Disconnect printer
 * POST /api/printer/disconnect
 */
router.post('/disconnect', authenticate, authorize(['Admin']), (req, res) => {
  try {
    const printerService = getPrinterService();
    printerService.disconnect();

    res.json({
      success: true,
      message: 'Printer disconnected',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect printer' });
  }
});

module.exports = router;
