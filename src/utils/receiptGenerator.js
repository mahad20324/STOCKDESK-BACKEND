const PDFDocument = require('pdfkit');

async function loadRemoteImageBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    return null;
  }
}

exports.generateReceiptPdf = async (stream, sale, settings) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const pageWidth  = doc.page.width;   // 595.28
  const pageHeight = doc.page.height;  // 841.89
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // ─── Colour palette ──────────────────────────────────────────
  const accent      = '#0D6E82';   // deep teal
  const accentDark  = '#09505F';   // darker teal (header bg)
  const accentLight = '#1A8EA6';   // lighter teal
  const accentSoft  = '#EDF7FA';   // very light teal fill
  const accentMid   = '#B8DEE8';   // mid teal (dividers)
  const gold        = '#C9A84C';   // gold stripe / accents
  const dark        = '#0F1E2C';   // near-black text
  const textPrimary = '#1C2E3B';
  const textSecondary = '#4A6070';
  const textMuted   = '#8A9BAA';
  const borderCol   = '#D0DFE8';
  const rowEven     = '#F4F8FA';
  const white       = '#FFFFFF';

  // ─── Sale data ───────────────────────────────────────────────
  const saleDate     = new Date(sale.createdAt);
  const currency     = sale.currency || settings.currency || 'USD';
  const shopName     = settings.shop?.name || settings.shopName || 'StockDesk';
  const shopAddress  = settings.shop?.address || settings.address || '';
  const shopPhone    = settings.shop?.phone || settings.phone || '';
  const shopSlug     = settings.shop?.slug || settings.shopSlug || '';

  let subtotal = 0;
  sale.items.forEach((item) => {
    subtotal += parseFloat(item.price) * item.quantity;
  });
  const discount  = parseFloat(sale.discount || 0);
  const vatRate   = parseFloat(settings.vat || 0) / 100;
  const vatAmount = vatRate > 0 ? (parseFloat(sale.total) * vatRate / (1 + vatRate)) : 0;
  const total     = parseFloat(sale.total || 0);

  const money = (value) =>
    `${currency} ${parseFloat(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const logoBuffer    = await loadRemoteImageBuffer(settings.shopLogoUrl);
  const bottomLimit   = pageHeight - 60;
  const paymentMethod = sale.paymentMethod || 'N/A';
  const cashierName   = sale.cashier?.name || 'N/A';
  const receiptNumber = sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;
  const formattedDate = saleDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const formattedTime = saleDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  let cursorY = 0;
  doc.pipe(stream);

  // ═══════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════
  const drawHeader = () => {
    const headerH = 136;

    // Main header background
    doc.rect(0, 0, pageWidth, headerH).fill(accentDark);

    // Gold accent stripe at very top
    doc.rect(0, 0, pageWidth, 5).fill(gold);

    // Decorative light circles (top-right corner accent)
    doc.save();
    doc.fillOpacity(0.07);
    doc.circle(pageWidth - 10, 0, 90).fill(white);
    doc.fillOpacity(0.06);
    doc.circle(pageWidth + 20, 80, 60).fill(white);
    doc.restore();

    // Diagonal bottom fade strip
    doc.save();
    doc.fillOpacity(0.25);
    doc.polygon([0, headerH - 18], [pageWidth, headerH - 36], [pageWidth, headerH], [0, headerH])
      .fill(accentLight);
    doc.restore();

    // ─ Logo (if any)
    const logoX = margin;
    const logoY = 26;
    if (logoBuffer) {
      try {
        doc.save();
        doc.fillOpacity(0.2);
        doc.roundedRect(logoX, logoY, 56, 56, 10).fill(white);
        doc.restore();
        doc.image(logoBuffer, logoX + 8, logoY + 8, { fit: [40, 40] });
      } catch {
        // ignore logo errors
      }
    }

    // ─ Shop name + tagline (left side)
    const shopTextX = logoBuffer ? logoX + 68 : logoX;
    doc.fillColor(white).font('Helvetica-Bold').fontSize(17).text(shopName, shopTextX, 30, { width: 260 });
    if (shopSlug) {
      doc.fillColor(accentMid).font('Helvetica').fontSize(8).text(
        shopSlug.toUpperCase(), shopTextX, 52, { width: 260, characterSpacing: 1.2 }
      );
    }
    let addrY = shopSlug ? 67 : 52;
    if (shopAddress) {
      doc.fillColor('#A8D5E2').font('Helvetica').fontSize(8.5).text(shopAddress, shopTextX, addrY, { width: 250 });
      addrY += 13;
    }
    if (shopPhone) {
      doc.fillColor('#A8D5E2').font('Helvetica').fontSize(8.5).text(shopPhone, shopTextX, addrY, { width: 250 });
    }

    // ─ "SALES RECEIPT" label (right side)
    doc.fillColor(white).font('Helvetica-Bold').fontSize(24).text('SALES RECEIPT', margin, 26, {
      align: 'right', width: contentWidth,
    });

    // Receipt number pill (right)
    const rnLabel = `# ${receiptNumber}`;
    const rnLabelW = 160;
    const rnX = margin + contentWidth - rnLabelW;
    doc.save();
    doc.roundedRect(rnX, 58, rnLabelW, 18, 9).fillOpacity(0.22).fill(white);
    doc.restore();
    doc.fillColor(white).font('Helvetica').fontSize(8.5).text(rnLabel, rnX, 62, {
      align: 'center', width: rnLabelW,
    });

    // Date (right)
    doc.fillColor(accentMid).font('Helvetica').fontSize(8).text(formattedDate, margin, 84, {
      align: 'right', width: contentWidth,
    });

    cursorY = headerH + 24;
  };

  // ═══════════════════════════════════════════════════════════
  // INFO TABLE  — single clean label | value rows (invoice style)
  // ═══════════════════════════════════════════════════════════
  const drawInfoTable = () => {
    const rows = [
      { label: 'Cashier',        value: cashierName },
      { label: 'Time',           value: formattedTime },
      { label: 'Payment',        value: paymentMethod },
      { label: 'Currency',       value: currency },
    ];

    const rowH      = 22;
    const labelW    = 110;
    const dividerX  = margin + labelW + 10;
    const valueX    = dividerX + 14;
    const valueW    = contentWidth - labelW - 34;
    const tableTop  = cursorY;
    const tableH    = rows.length * rowH + 14;

    // Outer container — subtle background, thin border
    doc.roundedRect(margin, tableTop, contentWidth, tableH, 6)
      .strokeColor(borderCol).lineWidth(0.75).stroke();

    // Gold-tinted left edge strip
    doc.roundedRect(margin, tableTop, 4, tableH, 2).fill(gold);

    // Vertical divider between label and value columns
    doc.moveTo(dividerX, tableTop + 8).lineTo(dividerX, tableTop + tableH - 8)
      .strokeColor(borderCol).lineWidth(0.75).stroke();

    rows.forEach((row, i) => {
      const ry = tableTop + 8 + i * rowH;

      // Subtle zebra stripe on even rows
      if (i % 2 === 0) {
        doc.rect(margin + 4, ry, contentWidth - 4, rowH)
          .fillOpacity(0.4).fill(accentSoft);
        doc.fillOpacity(1);
      }

      // Horizontal separator (not after last row)
      if (i < rows.length - 1) {
        doc.moveTo(margin + 4, ry + rowH).lineTo(margin + contentWidth, ry + rowH)
          .strokeColor(borderCol).lineWidth(0.4).stroke();
      }

      // Label
      doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(8.5).text(
        row.label, margin + 14, ry + 6, { width: labelW, characterSpacing: 0.2 }
      );

      // Value
      doc.fillColor(dark).font('Helvetica-Bold').fontSize(9.5).text(
        row.value, valueX, ry + 5, { width: valueW }
      );
    });

    cursorY = tableTop + tableH + 16;
  };

  // ═══════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ═══════════════════════════════════════════════════════════
  const COL_QTY   = { x: margin + 10,  w: 36  };
  const COL_NAME  = { x: margin + 56,  w: 248 };
  const COL_RATE  = { x: margin + 354, w: 90  };
  const COL_AMT   = { x: margin + 455, w: contentWidth - 455 - 10 };

  const drawTableHeader = () => {
    doc.rect(margin, cursorY, contentWidth, 28).fill(accent);
    doc.fillColor(white).font('Helvetica-Bold').fontSize(8.5);
    doc.text('QTY',            COL_QTY.x,                 cursorY + 10, { width: COL_QTY.w });
    doc.text('ITEM DESCRIPTION', COL_NAME.x,              cursorY + 10, { width: COL_NAME.w });
    doc.text('UNIT PRICE',     COL_RATE.x,                cursorY + 10, { width: COL_RATE.w, align: 'right' });
    doc.text('AMOUNT',         COL_AMT.x,                 cursorY + 10, { width: COL_AMT.w,  align: 'right' });
    cursorY += 28;
  };

  // ═══════════════════════════════════════════════════════════
  // PAGE BREAK HELPER
  // ═══════════════════════════════════════════════════════════
  const ensureSpace = (h) => {
    if (cursorY + h > bottomLimit) {
      doc.addPage();
      drawHeader();
      drawTableHeader();
    }
  };

  // ═══════════════════════════════════════════════════════════
  // BUILD PAGE
  // ═══════════════════════════════════════════════════════════
  drawHeader();
  drawInfoTable();

  // "ITEMS" section label
  doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(8).text('ITEMS', margin, cursorY - 10, {
    characterSpacing: 1,
  });
  const itemCount = sale.items.reduce((sum, it) => sum + it.quantity, 0);
  const badgeLabel = `${itemCount} unit${itemCount !== 1 ? 's' : ''}`;
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(7.5).text(
    badgeLabel, margin + contentWidth - 60, cursorY - 10, { width: 60, align: 'right' }
  );

  // Table top border
  doc.moveTo(margin, cursorY - 2).lineTo(margin + contentWidth, cursorY - 2)
    .strokeColor(accentMid).lineWidth(1).stroke();

  drawTableHeader();

  sale.items.forEach((item, index) => {
    const itemName   = item.Product?.name || item.name || 'Item';
    const lineTotal  = parseFloat(item.price) * item.quantity;
    const nameH      = doc.heightOfString(itemName, { width: COL_NAME.w });
    const rowH       = Math.max(30, nameH + 16);

    ensureSpace(rowH);

    const isEven = index % 2 === 0;
    doc.rect(margin, cursorY, contentWidth, rowH).fill(isEven ? rowEven : white);

    // Left accent stripe (alternating tones)
    doc.rect(margin, cursorY, 4, rowH).fill(isEven ? accentMid : borderCol);

    // Subtle bottom border on every row
    doc.moveTo(margin + 4, cursorY + rowH - 0.5).lineTo(margin + contentWidth, cursorY + rowH - 0.5)
      .strokeColor(borderCol).lineWidth(0.5).stroke();

    const rowMid = cursorY + rowH / 2 - 6;

    doc.fillColor(dark).font('Helvetica-Bold').fontSize(10.5)
      .text(String(item.quantity), COL_QTY.x, rowMid, { width: COL_QTY.w });
    doc.fillColor(textPrimary).font('Helvetica').fontSize(10.5)
      .text(itemName, COL_NAME.x, cursorY + (rowH - nameH) / 2 - 1, { width: COL_NAME.w });
    doc.fillColor(textSecondary).font('Helvetica').fontSize(10)
      .text(money(item.price), COL_RATE.x, rowMid, { width: COL_RATE.w, align: 'right' });
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(10.5)
      .text(money(lineTotal), COL_AMT.x, rowMid, { width: COL_AMT.w, align: 'right' });

    cursorY += rowH;
  });

  // Table bottom line
  doc.moveTo(margin, cursorY).lineTo(margin + contentWidth, cursorY)
    .strokeColor(accentMid).lineWidth(1.5).stroke();
  cursorY += 22;

  // ═══════════════════════════════════════════════════════════
  // NOTES + SUMMARY SECTION
  // ═══════════════════════════════════════════════════════════
  const summaryW  = 230;
  const summaryX  = margin + contentWidth - summaryW;
  const notesW    = contentWidth - summaryW - 16;
  const notesText = 'Please keep this receipt for exchange, returns, or warranty support.';

  // Calculate how tall the summary will be
  const summaryRows = 1 + (discount > 0 ? 1 : 0) + (vatAmount > 0 ? 1 : 0); // subtotal + optional rows
  const summaryH   = 34 + summaryRows * 26 + 10 + 46; // label + rows + gap + total block
  const sectionH   = Math.max(Math.max(summaryH, 160), 160);

  ensureSpace(sectionH + 20);
  const sectionTop = cursorY;

  // ─ Notes panel (left)
  doc.roundedRect(margin, sectionTop, notesW, sectionH, 8)
    .strokeColor(borderCol).lineWidth(0.75).stroke();
  doc.rect(margin, sectionTop, 4, sectionH).fill(accent);
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(10.5)
    .text('Terms & Notes', margin + 14, sectionTop + 14);
  doc.moveTo(margin + 14, sectionTop + 30).lineTo(margin + notesW - 14, sectionTop + 30)
    .strokeColor(accentMid).lineWidth(0.5).stroke();
  doc.fillColor(textSecondary).font('Helvetica').fontSize(9.5).text(
    notesText, margin + 14, sectionTop + 38, { width: notesW - 24, lineGap: 2.5 }
  );
  if (settings.receiptFooter) {
    const footerY = sectionTop + sectionH - 44;
    doc.moveTo(margin + 14, footerY - 6).lineTo(margin + notesW - 14, footerY - 6)
      .strokeColor(borderCol).lineWidth(0.5).stroke();
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(9)
      .text(settings.receiptFooter, margin + 14, footerY, { width: notesW - 24 });
  }
  doc.fillColor(textMuted).font('Helvetica').fontSize(8).text(
    `Issued by StockDesk  ·  ${receiptNumber}`,
    margin + 14, sectionTop + sectionH - 22, { width: notesW - 24 }
  );

  // ─ Receipt Summary panel (right)
  doc.roundedRect(summaryX, sectionTop, summaryW, sectionH, 8).fill(accentSoft);
  doc.rect(summaryX, sectionTop, summaryW, 4).fill(accent); // top accent bar on summary box

  let sY = sectionTop + 16;
  doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(7.5).text(
    'RECEIPT SUMMARY', summaryX + 14, sY, { width: summaryW - 28, characterSpacing: 0.8 }
  );
  sY += 20;

  const drawSummaryLine = (label, value, opts = {}) => {
    doc.moveTo(summaryX + 14, sY - 4).lineTo(summaryX + summaryW - 14, sY - 4)
      .strokeColor(opts.topLine ? accentMid : borderCol).lineWidth(0.5).stroke();
    doc.fillColor(opts.labelCol || textSecondary).font('Helvetica').fontSize(9.5)
      .text(label, summaryX + 14, sY, { width: 100 });
    doc.fillColor(opts.valueCol || textPrimary).font(opts.bold ? 'Helvetica-Bold' : 'Courier').fontSize(9.5)
      .text(value, summaryX + 120, sY, { width: summaryW - 134, align: 'right' });
    sY += 26;
  };

  drawSummaryLine('Subtotal', money(subtotal), { topLine: true });
  if (discount > 0) {
    drawSummaryLine('Discount', `- ${money(discount)}`, { labelCol: '#B91C1C', valueCol: '#B91C1C' });
  }
  if (vatAmount > 0) {
    drawSummaryLine(`VAT (${parseFloat(settings.vat || 0)}%)`, money(vatAmount));
  }

  // Total block — full-width teal filled row (flush to bottom of summary panel)
  const totalBlockY = sectionTop + sectionH - 46;
  doc.roundedRect(summaryX, totalBlockY, summaryW, 46, 8).fill(accent);
  doc.fillColor(white).font('Helvetica-Bold').fontSize(11)
    .text('TOTAL', summaryX + 14, totalBlockY + 15, { width: 90 });
  doc.fillColor(white).font('Helvetica-Bold').fontSize(13)
    .text(money(total), summaryX + 110, totalBlockY + 14, { width: summaryW - 124, align: 'right' });

  cursorY = sectionTop + sectionH + 20;

  // ═══════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════
  ensureSpace(72);
  cursorY += 8;

  // Gold divider line
  doc.rect(margin, cursorY, contentWidth, 2.5).fill(gold);
  cursorY += 14;

  // Thank you text
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(14).text('Thank You for Your Business!', margin, cursorY, {
    align: 'center', width: contentWidth,
  });
  cursorY += 20;

  const thankYouMsg = settings.receiptFooter && settings.receiptFooter !== settings.receiptHeader
    ? settings.receiptFooter
    : 'We appreciate your purchase and look forward to serving you again.';
  doc.fillColor(textMuted).font('Helvetica').fontSize(9).text(thankYouMsg, margin, cursorY, {
    align: 'center', width: contentWidth,
  });
  cursorY += 16;

  // Branding footer line
  doc.fillColor(borderCol).font('Helvetica').fontSize(7.5).text(
    `${shopName.toUpperCase()}  ·  ${receiptNumber}  ·  ${formattedDate}`,
    margin, cursorY, { align: 'center', width: contentWidth, characterSpacing: 0.4 }
  );

  doc.end();
};
