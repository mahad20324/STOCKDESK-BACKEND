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
  const margin     = 36;
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
  const bottomLimit   = pageHeight - 46;
  const paymentMethod = sale.paymentMethod || 'N/A';
  const cashierName   = sale.cashier?.name || 'N/A';
  const receiptNumber = sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;
  const formattedDate = saleDate.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
  const formattedTime = saleDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  let cursorY = 0;
  doc.pipe(stream);

  // ═══════════════════════════════════════════════════════════
  // HEADER — compact 104px
  // ═══════════════════════════════════════════════════════════
  const drawHeader = () => {
    const headerH = 104;
    doc.rect(0, 0, pageWidth, headerH).fill(accentDark);
    doc.rect(0, 0, pageWidth, 4).fill(gold);

    // Decorative circles
    doc.save();
    doc.fillOpacity(0.07); doc.circle(pageWidth - 10, 0, 80).fill(white);
    doc.fillOpacity(0.05); doc.circle(pageWidth + 20, 70, 50).fill(white);
    doc.restore();

    // Diagonal strip
    doc.save();
    doc.fillOpacity(0.2);
    doc.polygon([0, headerH - 12], [pageWidth, headerH - 26], [pageWidth, headerH], [0, headerH]).fill(accentLight);
    doc.restore();

    // Logo
    if (logoBuffer) {
      try {
        doc.save();
        doc.fillOpacity(0.18);
        doc.roundedRect(margin, 18, 48, 48, 8).fill(white);
        doc.restore();
        doc.image(logoBuffer, margin + 6, 24, { fit: [36, 36] });
      } catch { /* ignore */ }
    }

    // Shop name / address / phone
    const shopTextX = logoBuffer ? margin + 60 : margin;
    doc.fillColor(white).font('Helvetica-Bold').fontSize(15).text(shopName, shopTextX, 22, { width: 240 });
    if (shopSlug) {
      doc.fillColor(accentMid).font('Helvetica').fontSize(7).text(
        shopSlug.toUpperCase(), shopTextX, 41, { width: 240, characterSpacing: 1.1 }
      );
    }
    let addrY = shopSlug ? 53 : 41;
    if (shopAddress) {
      doc.fillColor('#A8D5E2').font('Helvetica').fontSize(7.5).text(shopAddress, shopTextX, addrY, { width: 230 });
      addrY += 11;
    }
    if (shopPhone) {
      doc.fillColor('#A8D5E2').font('Helvetica').fontSize(7.5).text(shopPhone, shopTextX, addrY, { width: 230 });
    }

    // SALES RECEIPT label
    doc.fillColor(white).font('Helvetica-Bold').fontSize(20).text('SALES RECEIPT', margin, 18, {
      align: 'right', width: contentWidth,
    });

    // Receipt number pill
    const rnW = 148;
    const rnX = margin + contentWidth - rnW;
    doc.save();
    doc.roundedRect(rnX, 46, rnW, 15, 7).fillOpacity(0.2).fill(white);
    doc.restore();
    doc.fillColor(white).font('Helvetica').fontSize(7.5).text(`# ${receiptNumber}`, rnX, 50, {
      align: 'center', width: rnW,
    });

    // Date
    doc.fillColor(accentMid).font('Helvetica').fontSize(7.5).text(formattedDate, margin, 68, {
      align: 'right', width: contentWidth,
    });

    cursorY = headerH + 14;
  };

  // ═══════════════════════════════════════════════════════════
  // INFO STRIP — horizontal 4-pair bar (saves ~80px vs table)
  // ═══════════════════════════════════════════════════════════
  const drawInfoStrip = () => {
    const stripH = 28;
    const stripY = cursorY;
    const pairs  = [
      { label: 'CASHIER',  value: cashierName   },
      { label: 'TIME',     value: formattedTime },
      { label: 'PAYMENT',  value: paymentMethod },
      { label: 'CURRENCY', value: currency      },
    ];

    doc.roundedRect(margin, stripY, contentWidth, stripH, 5).fill(accentSoft);
    doc.roundedRect(margin, stripY, 3, stripH, 2).fill(gold);
    doc.roundedRect(margin, stripY, contentWidth, stripH, 5)
      .strokeColor(borderCol).lineWidth(0.6).stroke();

    const colW = contentWidth / pairs.length;
    pairs.forEach((pair, i) => {
      const cx    = margin + i * colW;
      const textX = cx + (i === 0 ? 11 : 9);
      if (i > 0) {
        doc.moveTo(cx, stripY + 5).lineTo(cx, stripY + stripH - 5)
          .strokeColor(borderCol).lineWidth(0.5).stroke();
      }
      doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(6.5)
        .text(pair.label, textX, stripY + 4, { width: colW - 14, characterSpacing: 0.3 });
      doc.fillColor(dark).font('Helvetica-Bold').fontSize(8.5)
        .text(pair.value, textX, stripY + 13, { width: colW - 14 });
    });

    cursorY = stripY + stripH + 12;
  };

  // ═══════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ═══════════════════════════════════════════════════════════
  // contentWidth ≈ 523px. Give AMT ~140px so long currency amounts never wrap.
  const COL_QTY  = { x: margin + 7,   w: 26  };
  const COL_NAME = { x: margin + 39,  w: 210 };
  const COL_RATE = { x: margin + 255, w: 114 };
  const COL_AMT  = { x: margin + 375, w: contentWidth - 379 };

  const drawTableHeader = () => {
    doc.rect(margin, cursorY, contentWidth, 22).fill(accent);
    doc.fillColor(white).font('Helvetica-Bold').fontSize(7.5);
    doc.text('QTY',              COL_QTY.x,  cursorY + 7, { width: COL_QTY.w });
    doc.text('ITEM DESCRIPTION', COL_NAME.x, cursorY + 7, { width: COL_NAME.w });
    doc.text('UNIT PRICE',       COL_RATE.x, cursorY + 7, { width: COL_RATE.w, align: 'right' });
    doc.text('AMOUNT',           COL_AMT.x,  cursorY + 7, { width: COL_AMT.w,  align: 'right' });
    cursorY += 22;
  };

  // Page break for ITEM rows — redraws page header + table header on next page
  const ensureItemSpace = (h) => {
    if (cursorY + h > bottomLimit) {
      doc.addPage();
      drawHeader();
      drawTableHeader();
    }
  };

  // Page break for non-item sections — redraws only the page header
  const ensureSpace = (h) => {
    if (cursorY + h > bottomLimit) {
      doc.addPage();
      drawHeader();
    }
  };

  // ═══════════════════════════════════════════════════════════
  // BUILD PAGE
  // ═══════════════════════════════════════════════════════════
  drawHeader();
  drawInfoStrip();

  // Section label
  const itemCount = sale.items.reduce((sum, it) => sum + it.quantity, 0);
  doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(7)
    .text('ITEMS', margin, cursorY, { characterSpacing: 0.8 });
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(7)
    .text(
      `${sale.items.length} line${sale.items.length !== 1 ? 's' : ''}  ·  ${itemCount} unit${itemCount !== 1 ? 's' : ''}`,
      margin, cursorY, { align: 'right', width: contentWidth }
    );
  cursorY += 13;

  doc.moveTo(margin, cursorY).lineTo(margin + contentWidth, cursorY)
    .strokeColor(accentMid).lineWidth(1).stroke();

  drawTableHeader();

  // ─── Item rows ───────────────────────────────────────────────
  sale.items.forEach((item, index) => {
    const itemName  = item.Product?.name || item.name || 'Item';
    const lineTotal = parseFloat(item.price) * item.quantity;
    const nameH     = doc.heightOfString(itemName, { width: COL_NAME.w, fontSize: 9 });
    const rowH      = Math.max(20, nameH + 10);

    ensureItemSpace(rowH);

    const isEven = index % 2 === 0;
    doc.rect(margin, cursorY, contentWidth, rowH).fill(isEven ? rowEven : white);
    doc.rect(margin, cursorY, 3, rowH).fill(isEven ? accentMid : borderCol);
    doc.moveTo(margin + 3, cursorY + rowH - 0.5).lineTo(margin + contentWidth, cursorY + rowH - 0.5)
      .strokeColor(borderCol).lineWidth(0.4).stroke();

    const mid = cursorY + rowH / 2 - 5;
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(9)
      .text(String(item.quantity), COL_QTY.x, mid, { width: COL_QTY.w });
    doc.fillColor(textPrimary).font('Helvetica').fontSize(9)
      .text(itemName, COL_NAME.x, cursorY + (rowH - nameH) / 2 - 1, { width: COL_NAME.w });
    doc.fillColor(textSecondary).font('Helvetica').fontSize(8.5)
      .text(money(item.price), COL_RATE.x, mid, { width: COL_RATE.w, align: 'right', lineBreak: false });
    doc.fillColor(dark).font('Helvetica-Bold').fontSize(9)
      .text(money(lineTotal), COL_AMT.x, mid, { width: COL_AMT.w, align: 'right', lineBreak: false });

    cursorY += rowH;
  });

  // Bottom border
  doc.moveTo(margin, cursorY).lineTo(margin + contentWidth, cursorY)
    .strokeColor(accentMid).lineWidth(1.2).stroke();
  cursorY += 14;

  // ═══════════════════════════════════════════════════════════
  // SUMMARY + NOTES + FOOTER — always kept together on same page
  // ═══════════════════════════════════════════════════════════
  const summaryW    = 216;
  const summaryX    = margin + contentWidth - summaryW;
  const notesW      = contentWidth - summaryW - 12;
  const summaryRows = 1 + (discount > 0 ? 1 : 0) + (vatAmount > 0 ? 1 : 0);
  const summaryH    = 26 + summaryRows * 20 + 8 + 38;
  const sectionH    = Math.max(summaryH, 110);
  const footerH     = 52;

  // One single page-break check covers summary + footer together
  ensureSpace(sectionH + footerH + 10);
  const sectionTop = cursorY;

  // Notes panel
  doc.roundedRect(margin, sectionTop, notesW, sectionH, 6)
    .strokeColor(borderCol).lineWidth(0.6).stroke();
  doc.rect(margin, sectionTop, 3, sectionH).fill(accent);
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(9)
    .text('Terms & Notes', margin + 11, sectionTop + 11);
  doc.moveTo(margin + 11, sectionTop + 24).lineTo(margin + notesW - 11, sectionTop + 24)
    .strokeColor(accentMid).lineWidth(0.4).stroke();
  doc.fillColor(textSecondary).font('Helvetica').fontSize(8.5).text(
    'Please keep this receipt for exchange, returns, or warranty support.',
    margin + 11, sectionTop + 30, { width: notesW - 18, lineGap: 2 }
  );
  doc.fillColor(textMuted).font('Helvetica').fontSize(7.5).text(
    `Issued by StockDesk  ·  ${receiptNumber}`,
    margin + 11, sectionTop + sectionH - 16, { width: notesW - 18 }
  );

  // Summary panel
  doc.roundedRect(summaryX, sectionTop, summaryW, sectionH, 6).fill(accentSoft);
  doc.rect(summaryX, sectionTop, summaryW, 3).fill(accent);

  let sY = sectionTop + 12;
  doc.fillColor(textMuted).font('Helvetica-Bold').fontSize(6.5)
    .text('RECEIPT SUMMARY', summaryX + 12, sY, { width: summaryW - 24, characterSpacing: 0.7 });
  sY += 16;

  const drawSummaryLine = (label, value, opts = {}) => {
    doc.moveTo(summaryX + 12, sY - 3).lineTo(summaryX + summaryW - 12, sY - 3)
      .strokeColor(opts.topLine ? accentMid : borderCol).lineWidth(0.4).stroke();
    doc.fillColor(opts.labelCol || textSecondary).font('Helvetica').fontSize(8.5)
      .text(label, summaryX + 12, sY, { width: 86 });
    doc.fillColor(opts.valueCol || textPrimary).font('Courier').fontSize(8.5)
      .text(value, summaryX + 104, sY, { width: summaryW - 116, align: 'right' });
    sY += 20;
  };

  drawSummaryLine('Subtotal', money(subtotal), { topLine: true });
  if (discount > 0) {
    drawSummaryLine('Discount', `- ${money(discount)}`, { labelCol: '#B91C1C', valueCol: '#B91C1C' });
  }
  if (vatAmount > 0) {
    drawSummaryLine(`VAT (${parseFloat(settings.vat || 0)}%)`, money(vatAmount));
  }

  // Total block — single line, fits any currency
  const totalBlockY = sectionTop + sectionH - 38;
  doc.roundedRect(summaryX, totalBlockY, summaryW, 38, 6).fill(accent);
  doc.fillColor(white).font('Helvetica-Bold').fontSize(9.5)
    .text('TOTAL', summaryX + 12, totalBlockY + 13, { width: 52 });
  doc.fillColor(white).font('Helvetica-Bold').fontSize(9.5)
    .text(money(total), summaryX + 70, totalBlockY + 13, { width: summaryW - 82, align: 'right' });

  cursorY = sectionTop + sectionH + 14;

  // ─ Footer — same page, no separate ensureSpace
  doc.rect(margin, cursorY, contentWidth, 2).fill(gold);
  cursorY += 9;

  doc.fillColor(accent).font('Helvetica-Bold').fontSize(12)
    .text('Thank You for Your Business!', margin, cursorY, { align: 'center', width: contentWidth });
  cursorY += 15;

  doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
    .text('We appreciate your purchase and look forward to serving you again.', margin, cursorY, {
      align: 'center', width: contentWidth,
    });
  cursorY += 12;

  doc.fillColor(borderCol).font('Helvetica').fontSize(7)
    .text(
      `${shopName.toUpperCase()}  ·  ${receiptNumber}  ·  ${formattedDate}`,
      margin, cursorY, { align: 'center', width: contentWidth, characterSpacing: 0.3 }
    );

  doc.end();
};
