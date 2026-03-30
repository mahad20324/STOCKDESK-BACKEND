const PDFDocument = require('pdfkit');

async function loadRemoteImageBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    return null;
  }
}

exports.generateReceiptPdf = async (stream, sale, settings) => {
  const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const accent = '#1F7A8C';
  const accentSoft = '#EAF6F8';
  const dark = '#102A43';
  const muted = '#5C6B7A';
  const border = '#D9E2EC';
  const saleDate = new Date(sale.createdAt);
  const currency = sale.currency || settings.currency || 'USD';
  const shopName = settings.shop?.name || settings.shopName || 'StockDesk';
  const shopSlug = settings.shop?.slug || `shop-${settings.shopId || 'legacy'}`;

  let subtotal = 0;
  sale.items.forEach((item) => {
    subtotal += parseFloat(item.price) * item.quantity;
  });

  const discount = parseFloat(sale.discount || 0);
  const vatRate = parseFloat(settings.vat || 0) / 100;
  const vatAmount = vatRate > 0 ? (parseFloat(sale.total) * vatRate / (1 + vatRate)) : 0;
  const total = parseFloat(sale.total || 0);

  const money = (value) => `${currency} ${parseFloat(value || 0).toFixed(2)}`;
  const logoBuffer = await loadRemoteImageBuffer(settings.shopLogoUrl);

  doc.pipe(stream);

  doc.rect(0, 0, pageWidth, 108).fill(accent);
  if (logoBuffer) {
    try {
      doc.roundedRect(margin, 24, 56, 56, 12).fillOpacity(0.18).fillAndStroke('#ffffff', '#ffffff');
      doc.fillOpacity(1);
      doc.image(logoBuffer, margin + 6, 30, { fit: [44, 44], align: 'center', valign: 'center' });
    } catch (error) {
      doc.fillOpacity(1);
    }
  }
  doc.fillColor('white').font('Helvetica-Bold').fontSize(24).text('SALES RECEIPT', margin, 38, { align: 'right', width: contentWidth });
  doc.font('Helvetica-Bold').fontSize(12).text(shopName, logoBuffer ? margin + 72 : margin, 28, { width: 220 });
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#DFF6FB').text(shopSlug.toUpperCase(), logoBuffer ? margin + 72 : margin, 16, { width: 220, characterSpacing: 1 });
  doc.fillColor('white');
  if (settings.address) {
    doc.font('Helvetica').fontSize(10).text(settings.address, logoBuffer ? margin + 72 : margin, 44, { width: 220 });
  }
  if (settings.phone) {
    doc.text(settings.phone, logoBuffer ? margin + 72 : margin, 72, { width: 220 });
  }

  const detailTop = 132;
  const labelWidth = 90;
  const valueWidth = 120;
  const startX = margin;
  const drawMetaRow = (label, value, x, y) => {
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x, y, { width: labelWidth });
    doc.fillColor(dark).font('Helvetica').fontSize(10).text(value, x, y + 12, { width: valueWidth });
  };

  drawMetaRow('Receipt No.', sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`, startX, detailTop);
  drawMetaRow('Date', saleDate.toLocaleDateString(), startX + 150, detailTop);
  drawMetaRow('Time', saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), startX + 300, detailTop);
  drawMetaRow('Cashier', sale.cashier?.name || 'N/A', startX, detailTop + 42);
  drawMetaRow('Payment', sale.paymentMethod || 'N/A', startX + 150, detailTop + 42);
  drawMetaRow('Currency', currency, startX + 300, detailTop + 42);
  drawMetaRow('Shop', shopSlug, startX, detailTop + 84);

  const tableTop = 240;
  const columns = {
    qty: margin + 12,
    item: margin + 70,
    unit: margin + 340,
    amount: margin + 455,
  };

  doc.roundedRect(margin, tableTop, contentWidth, 28, 8).fill(accentSoft);
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(10);
  doc.text('QTY', columns.qty, tableTop + 9, { width: 40 });
  doc.text('ITEM DESCRIPTION', columns.item, tableTop + 9, { width: 220 });
  doc.text('RATE', columns.unit, tableTop + 9, { width: 80, align: 'right' });
  doc.text('AMOUNT', columns.amount, tableTop + 9, { width: 80, align: 'right' });

  let currentY = tableTop + 42;
  doc.font('Helvetica').fontSize(10).fillColor(dark);

  sale.items.forEach((item, index) => {
    const lineTotal = parseFloat(item.price) * item.quantity;
    const rowHeight = 34;
    if (index % 2 === 0) {
      doc.rect(margin, currentY - 6, contentWidth, rowHeight).fill('#FAFCFD');
    }
    doc.fillColor(dark);
    doc.text(String(item.quantity), columns.qty, currentY, { width: 30 });
    doc.text(item.Product?.name || 'Item', columns.item, currentY, { width: 250 });
    doc.text(money(item.price), columns.unit, currentY, { width: 85, align: 'right' });
    doc.font('Helvetica-Bold').text(money(lineTotal), columns.amount, currentY, { width: 80, align: 'right' });
    doc.font('Helvetica');
    currentY += rowHeight;
  });

  const summaryTop = currentY + 18;
  const summaryX = margin + 320;
  const summaryWidth = contentWidth - 320;

  const summaryHeight = 166;
  doc.roundedRect(summaryX, summaryTop, summaryWidth, summaryHeight, 10).fillAndStroke('#FBFDFD', border);
  let summaryY = summaryTop + 16;

  doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text('RECEIPT SUMMARY', summaryX + 16, summaryY, {
    width: summaryWidth - 32,
    characterSpacing: 1,
  });
  summaryY += 18;

  const drawSummaryRow = (label, value, options = {}) => {
    if (!options.highlight) {
      doc.moveTo(summaryX + 16, summaryY - 6).lineTo(summaryX + summaryWidth - 16, summaryY - 6).strokeColor('#E7EEF3').lineWidth(1).stroke();
    }

    if (options.highlight) {
      doc.roundedRect(summaryX + 12, summaryY - 2, summaryWidth - 24, 30, 8).fill(accent);
      doc.fillColor('white');
    } else {
      doc.fillColor(options.color || muted);
    }

    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 10);
    doc.text(label, summaryX + 24, summaryY + (options.highlight ? 6 : 0), { width: 120 });
    doc.font(options.highlight ? 'Helvetica-Bold' : 'Courier').fontSize(options.size || 10);
    doc.text(value, summaryX + 120, summaryY + (options.highlight ? 6 : 0), { width: summaryWidth - 152, align: 'right' });
    summaryY += options.spacing || 22;
  };

  drawSummaryRow('Subtotal', money(subtotal), { color: dark });
  drawSummaryRow('Discount', `${discount > 0 ? '- ' : ''}${money(discount)}`, { color: discount > 0 ? '#C81E1E' : '#9AA5B1' });
  drawSummaryRow(`VAT (${parseFloat(settings.vat || 0).toFixed(2)}%)`, money(vatAmount), { color: vatAmount > 0 ? dark : '#9AA5B1' });

  drawSummaryRow('Total', money(total), { bold: true, size: 14, spacing: 38, highlight: true });

  const notesTop = Math.max(summaryTop, currentY + 18);
  doc.roundedRect(margin, notesTop, 280, 118, 10).strokeColor(border).lineWidth(1).stroke();
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(11).text('Terms & Notes', margin + 16, notesTop + 14);
  doc.fillColor(muted).font('Helvetica').fontSize(10).text(settings.receiptHeader || 'Please keep this receipt for exchange, returns, or warranty support.', margin + 16, notesTop + 34, { width: 248 });
  doc.moveDown(0.2);
  doc.text(settings.receiptFooter || 'Thank you for shopping with us.', margin + 16, notesTop + 72, { width: 248 });

  doc.rect(0, pageHeight - 52, pageWidth, 52).fill(accent);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(16).text('Total', margin, pageHeight - 35);
  doc.text(money(total), pageWidth - margin - 160, pageHeight - 35, { width: 160, align: 'right' });

  doc.end();
};
