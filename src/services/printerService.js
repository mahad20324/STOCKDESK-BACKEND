const escpos = require('escpos');
const USB = require('escpos-usb');
const Network = require('escpos-network');

class PrinterService {
  constructor() {
    this.printer = null;
    this.printerType = null; // 'usb', 'network'
    this.config = {
      width: 48, // thermal printer width (48 or 32 chars)
      encoding: 'UTF8',
    };
  }

  /**
   * Initialize printer connection
   * @param {Object} settings - { type: 'usb' | 'network', vendorId, productId, or ip, port }
   * @returns {Promise<boolean>}
   */
  async connect(settings) {
    try {
      if (settings.type === 'usb') {
        return this._connectUSB(settings);
      } else if (settings.type === 'network') {
        return this._connectNetwork(settings);
      }
      return false;
    } catch (error) {
      console.error('Printer connection error:', error.message);
      throw new Error(`Failed to connect to printer: ${error.message}`);
    }
  }

  /**
   * Connect to USB printer
   * @private
   */
  _connectUSB(settings) {
    const { vendorId = 0x04b8, productId = 0x0202 } = settings;
    const device = new USB.USB(vendorId, productId);
    this.printer = new escpos.Printer(device);
    this.printerType = 'usb';
    return true;
  }

  /**
   * Connect to Network printer
   * @private
   */
  _connectNetwork(settings) {
    const { ip = '192.168.1.100', port = 9100 } = settings;
    const device = new Network(ip, port, { timeout: 10000 });
    this.printer = new escpos.Printer(device);
    this.printerType = 'network';
    return true;
  }

  /**
   * Print receipt with sale data
   * @param {Object} saleData - { items, total, currency, discount, paymentMethod, shopName, etc }
   * @param {Object} settings - Shop settings
   * @returns {Promise<boolean>}
   */
  async printReceipt(saleData, settings) {
    if (!this.printer) {
      throw new Error('Printer not connected. Please configure printer settings.');
    }

    try {
      const receipt = this._formatReceipt(saleData, settings);
      await this._sendToPrinter(receipt);
      return true;
    } catch (error) {
      console.error('Print error:', error.message);
      throw new Error(`Failed to print receipt: ${error.message}`);
    }
  }

  /**
   * Format receipt content using ESC/POS commands
   * @private
   */
  _formatReceipt(data, settings) {
    const centerPadding = (str) => {
      const width = this.config.width;
      const padding = Math.max(0, Math.floor((width - str.length) / 2));
      return ' '.repeat(padding) + str;
    };

    const leftRight = (left, right, width = this.config.width) => {
      const spaces = Math.max(0, width - left.length - right.length);
      return left + ' '.repeat(spaces) + right;
    };

    const padRight = (str, width = this.config.width) => {
      return str.substring(0, width).padEnd(width, ' ');
    };

    let receipt = '';

    // Header
    receipt += '\n';
    receipt += centerPadding((settings.shopName || 'StockDesk').toUpperCase()) + '\n';
    receipt += centerPadding(settings.address || '') + '\n';
    
    // Company details
    if (settings.phone) {
      receipt += centerPadding(`Tel: ${settings.phone}`) + '\n';
    }
    receipt += centerPadding(`Date: ${new Date(data.createdAt || Date.now()).toLocaleDateString()}`) + '\n';
    receipt += '\n';
    receipt += '='.repeat(this.config.width) + '\n';

    // Receipt header with columns
    receipt += leftRight('Qty', leftRight('Description', 'Amount', 25), 15) + '\n';
    receipt += '-'.repeat(this.config.width) + '\n';

    // Items
    let subtotal = 0;
    data.items.forEach((item) => {
      const quantity = item.quantity || 1;
      const price = parseFloat(item.price || 0);
      const lineTotal = price * quantity;
      subtotal += lineTotal;

      const itemName = item.name.substring(0, 20);
      const qty = String(quantity);
      const amount = `${data.currency} ${lineTotal.toFixed(2)}`;
      
      receipt += leftRight(qty, leftRight(itemName, amount, 25), 15) + '\n';
      receipt += leftRight('', `@ ${data.currency} ${price.toFixed(2)} each`, 15) + '\n';
    });

    receipt += '-'.repeat(this.config.width) + '\n';

    // Subtotal
    receipt += leftRight('Subtotal:', `${data.currency} ${subtotal.toFixed(2)}`) + '\n';

    // Discount with percentage
    if (data.discount && parseFloat(data.discount) > 0) {
      const discountPercent = data.discountType === 'percentage' 
        ? data.discount.toFixed(1)
        : ((parseFloat(data.discount) / subtotal) * 100).toFixed(1);
      receipt += leftRight('Less 10% Discount', `-${data.currency} ${parseFloat(data.discount).toFixed(2)}`) + '\n';
    }

    // Total (bold section)
    receipt += '='.repeat(this.config.width) + '\n';
    receipt += leftRight('TOTAL:', `${data.currency} ${parseFloat(data.total).toFixed(2)}`) + '\n';
    receipt += '='.repeat(this.config.width) + '\n';

    // Calculate VAT (using settings vat rate)
    const vatRate = parseFloat(settings.vat || 0) / 100;
    const vatAmount = (parseFloat(data.total) * vatRate / (1 + vatRate)).toFixed(2);
    if (parseFloat(settings.vat) > 0) {
      receipt += leftRight(`VAT @ ${settings.vat}%:`, `${data.currency} ${vatAmount}`) + '\n';
    }

    // Payment method
    receipt += leftRight('Paid by:', data.paymentMethod || 'Cash') + '\n';
    receipt += '\n';

    // Footer
    receipt += centerPadding('Thank you!') + '\n';
    receipt += '\n\n\n';

    return receipt;
  }

  /**
   * Send formatted receipt to printer using ESC/POS
   * @private
   */
  async _sendToPrinter(receiptText) {
    return new Promise((resolve, reject) => {
      try {
        this.printer
          .font('a')
          .align('ct')
          .style('b')
          .size(1, 1)
          .text(receiptText)
          .cut()
          .close()
          .then(() => resolve())
          .catch((err) => reject(err));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Test print - prints a simple test message
   */
  async testPrint() {
    if (!this.printer) {
      throw new Error('Printer not connected');
    }

    try {
      await new Promise((resolve, reject) => {
        this.printer
          .font('a')
          .align('ct')
          .style('b')
          .size(1, 1)
          .text('== TEST PRINT ==')
          .text('Printer connected successfully!')
          .text('')
          .text(new Date().toLocaleString())
          .cut()
          .close()
          .then(() => resolve())
          .catch((err) => reject(err));
      });
      return true;
    } catch (error) {
      throw new Error(`Test print failed: ${error.message}`);
    }
  }

  /**
   * Disconnect printer
   */
  disconnect() {
    if (this.printer) {
      try {
        this.printer.close();
        this.printer = null;
        this.printerType = null;
      } catch (error) {
        console.error('Error disconnecting printer:', error);
      }
    }
  }

  /**
   * Check if printer is connected
   */
  isConnected() {
    return this.printer !== null;
  }

  /**
   * Get printer status
   */
  getStatus() {
    return {
      connected: this.isConnected(),
      type: this.printerType,
      width: this.config.width,
    };
  }
}

// Singleton instance
let printerService = null;

module.exports = {
  getPrinterService() {
    if (!printerService) {
      printerService = new PrinterService();
    }
    return printerService;
  },
  PrinterService,
};
