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
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 36;
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

  const money = (value) => `${currency} ${parseFloat(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const logoBuffer = await loadRemoteImageBuffer(settings.shopLogoUrl);
  const bottomLimit = pageHeight - margin - 44;

  doc.pipe(stream);

  const drawHeader = (isContinuation = false) => {
    doc.rect(0, 0, pageWidth, 100).fill(accent);
    if (logoBuffer) {
      try {
        doc.roundedRect(margin, 22, 52, 52, 12).fillOpacity(0.18).fillAndStroke('#ffffff', '#ffffff');
        doc.fillOpacity(1);
        doc.image(logoBuffer, margin + 6, 28, { fit: [40, 40], align: 'center', valign: 'center' });
      } catch (error) {
        doc.fillOpacity(1);
      }
    }

    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text(isContinuation ? 'RECEIPT DETAILS' : 'SALES RECEIPT', margin, 34, {
      align: 'right',
      width: contentWidth,
    });
    doc.font('Helvetica-Bold').fontSize(12).text(shopName, logoBuffer ? margin + 66 : margin, 28, { width: 240 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#DFF6FB').text(shopSlug.toUpperCase(), logoBuffer ? margin + 66 : margin, 16, {
      width: 240,
      characterSpacing: 1,
    });
    doc.fillColor('white').font('Helvetica').fontSize(9);
    if (settings.address) {
      doc.text(settings.address, logoBuffer ? margin + 66 : margin, 44, { width: 250 });
    }
    if (settings.phone) {
      doc.text(settings.phone, logoBuffer ? margin + 66 : margin, 68, { width: 250 });
    }
  };

  const ensureSpace = (heightNeeded, onNewPage) => {
    if (doc.y + heightNeeded <= bottomLimit) {
      return;
    }

    doc.addPage();
    drawHeader(true);
    doc.y = 120;
    if (onNewPage) {
      onNewPage();
    }
  };

  drawHeader();

  const detailTop = 122;
  const labelWidth = 88;
  const valueWidth = 118;
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

  const tableTop = 228;
  const columns = {
    qty: margin + 12,
    item: margin + 70,
    unit: margin + 332,
    amount: margin + 448,
  };

  const drawItemsHeader = () => {
    doc.roundedRect(margin, doc.y, contentWidth, 28, 8).fill(accentSoft);
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(10);
    doc.text('QTY', columns.qty, doc.y + 9, { width: 40 });
    doc.text('ITEM DESCRIPTION', columns.item, doc.y + 9, { width: 220 });
    doc.text('RATE', columns.unit, doc.y + 9, { width: 88, align: 'right' });
    doc.text('AMOUNT', columns.amount, doc.y + 9, { width: 86, align: 'right' });
    doc.y += 40;
  };

  doc.y = tableTop;
  drawItemsHeader();
  doc.font('Helvetica').fontSize(10).fillColor(dark);

  sale.items.forEach((item, index) => {
    const lineTotal = parseFloat(item.price) * item.quantity;
    const rowHeight = 34;
    ensureSpace(rowHeight + 10, drawItemsHeader);

    if (index % 2 === 0) {
      doc.rect(margin, doc.y - 6, contentWidth, rowHeight).fill('#FAFCFD');
    }

    doc.fillColor(dark);
    doc.text(String(item.quantity), columns.qty, doc.y, { width: 30 });
    doc.text(item.Product?.name || 'Item', columns.item, doc.y, { width: 248 });
    doc.text(money(item.price), columns.unit, doc.y, { width: 88, align: 'right' });
    doc.font('Helvetica-Bold').text(money(lineTotal), columns.amount, doc.y, { width: 86, align: 'right' });
    doc.font('Helvetica');
    doc.y += rowHeight;
  });

  ensureSpace(210);
  const sectionTop = doc.y + 14;
  const notesWidth = 282;
  const gap = 18;
  const summaryX = margin + notesWidth + gap;
  const summaryWidth = pageWidth - summaryX - margin;

  doc.roundedRect(margin, sectionTop, notesWidth, 118, 10).strokeColor(border).lineWidth(1).stroke();
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(11).text('Terms & Notes', margin + 16, sectionTop + 14);
  doc.fillColor(muted).font('Helvetica').fontSize(10).text(
    settings.receiptHeader || 'Please keep this receipt for exchange, returns, or warranty support.',
    margin + 16,
    sectionTop + 34,
    { width: notesWidth - 32, lineGap: 2 }
  );
  doc.text(settings.receiptFooter || 'Thank you for shopping with us.', margin + 16, sectionTop + 78, {
    width: notesWidth - 32,
    lineGap: 2,
  });

  doc.roundedRect(summaryX, sectionTop, summaryWidth, 166, 10).fillAndStroke('#FBFDFD', border);
  let summaryY = sectionTop + 16;
  doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text('RECEIPT SUMMARY', summaryX + 16, summaryY, {
    width: summaryWidth - 32,
    characterSpacing: 1,
  });
  summaryY += 22;

  const drawSummaryRow = (label, value, options = {}) => {
    if (!options.highlight) {
      doc.moveTo(summaryX + 16, summaryY - 6).lineTo(summaryX + summaryWidth - 16, summaryY - 6).strokeColor('#E7EEF3').lineWidth(1).stroke();
    }

    if (options.highlight) {
      doc.roundedRect(summaryX + 12, summaryY - 2, summaryWidth - 24, 34, 8).fill(accent);
      doc.fillColor('white');
    } else {
      doc.fillColor(options.color || muted);
    }

    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 10);
    doc.text(label, summaryX + 24, summaryY + (options.highlight ? 8 : 0), { width: 104 });
    doc.font(options.highlight ? 'Helvetica-Bold' : 'Courier').fontSize(options.size || 10);
    doc.text(value, summaryX + 132, summaryY + (options.highlight ? 8 : 0), {
      width: summaryWidth - 156,
      align: 'right',
    });
    summaryY += options.spacing || 24;
  };

  drawSummaryRow('Subtotal', money(subtotal), { color: dark });
  drawSummaryRow('Discount', `${discount > 0 ? '- ' : ''}${money(discount)}`, { color: discount > 0 ? '#C81E1E' : '#9AA5B1' });
  drawSummaryRow(`VAT (${parseFloat(settings.vat || 0).toFixed(2)}%)`, money(vatAmount), { color: vatAmount > 0 ? dark : '#9AA5B1' });
  drawSummaryRow('Total', money(total), { bold: true, size: 13, spacing: 40, highlight: true });

  doc.fillColor(muted).font('Helvetica').fontSize(9).text(`Payment: ${sale.paymentMethod || 'N/A'}`, margin, sectionTop + 130, {
    width: notesWidth,
  });
  doc.text(`Cashier: ${sale.cashier?.name || 'N/A'}`, margin, sectionTop + 144, { width: notesWidth });

  doc.end();
};
