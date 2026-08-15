const { PassThrough } = require('stream');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const Twilio = require('twilio');
const { generateReceiptPdf } = require('../utils/receiptGenerator');
const path = require('path');
const crypto = require('crypto');

const s3Client = process.env.S3_BUCKET
  ? new S3Client({ region: process.env.S3_REGION })
  : null;

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function uploadBufferToS3(buffer, filename, contentType = 'application/pdf') {
  if (!s3Client) throw new Error('S3 not configured. Set S3_BUCKET and S3_REGION');

  const Key = filename;
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
  };

  await s3Client.send(new PutObjectCommand(params));

  const base = process.env.MEDIA_BASE_URL || `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`;
  return `${base}/${encodeURIComponent(Key)}`;
}

async function generateReceiptBuffer(sale, settings) {
  const passthrough = new PassThrough();
  const promise = streamToBuffer(passthrough);
  // generateReceiptPdf writes to the provided stream
  await generateReceiptPdf(passthrough, sale, settings);
  return promise;
}

async function sendReceiptViaTwilio({ fromNumber, toNumber, sale, settings }) {
  if (!twilioClient) throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
  if (!process.env.S3_BUCKET && !process.env.MEDIA_BASE_URL) {
    throw new Error('Media hosting not configured. Set S3_BUCKET or MEDIA_BASE_URL');
  }

  const buffer = await generateReceiptBuffer(sale, settings);
  const filename = `receipts/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
  const url = await uploadBufferToS3(buffer, filename, 'application/pdf');

  // Twilio expects whatsapp: prefixed numbers
  const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
  const to = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

  const message = await twilioClient.messages.create({
    from,
    to,
    body: settings?.whatsappMessage || 'Here is your receipt from ' + (settings?.shopName || 'our shop'),
    mediaUrl: [url],
  });

  return message;
}

async function sendTextViaTwilio({ fromNumber, toNumber, body }) {
  if (!twilioClient) throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');

  const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
  const to = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

  return twilioClient.messages.create({ from, to, body });
}

function hasPdfHosting() {
  return !!(s3Client || process.env.MEDIA_BASE_URL);
}

function buildTextReceipt(sale, settings = {}) {
  const currency = sale.currency || settings.currency || 'USD';
  const money = (value) => `${currency} ${Number(value || 0).toFixed(2)}`;

  const items = sale.items || [];
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const discount = Number(sale.discount || 0);
  const total = Number(sale.total || (subtotal - discount));
  const vatRate = Number(settings.vat || 0);
  const vat = vatRate > 0 ? Number(((total * vatRate) / (1 + vatRate)).toFixed(2)) : 0;

  const receiptNumber = sale.receipt?.receiptNumber || sale.id;
  const date = sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '';

  const lines = [];
  lines.push(`*${settings.shopName || 'StockDesk'}*`);
  if (settings.address) lines.push(settings.address);
  if (settings.phone) lines.push(settings.phone);
  lines.push('');
  lines.push(`Receipt: #${receiptNumber}`);
  if (date) lines.push(date);
  lines.push('--------------------------------');
  items.forEach((item) => {
    const name = item.Product?.name || item.name || 'Item';
    lines.push(`${item.quantity} x ${name}`);
    lines.push(`    ${money(Number(item.price) * Number(item.quantity))}`);
  });
  lines.push('--------------------------------');
  lines.push(`Subtotal: ${money(subtotal)}`);
  if (discount > 0) lines.push(`Discount: -${money(discount)}`);
  if (vatRate > 0) lines.push(`VAT @ ${vatRate}%: ${money(vat)}`);
  lines.push(`*TOTAL: ${money(total)}*`);
  lines.push('--------------------------------');
  if (sale.paymentMethod) lines.push(`Payment: ${sale.paymentMethod}`);
  if (sale.cashier?.username) lines.push(`Cashier: ${sale.cashier.username}`);
  lines.push('');
  lines.push('Thank you!');
  if (settings.receiptFooter) lines.push(settings.receiptFooter);

  return lines.join('\n');
}

module.exports = {
  sendReceipt: async ({ provider = 'twilio', fromNumber, toNumber, sale, settings }) => {
    if (provider !== 'twilio') throw new Error('Only Twilio provider is implemented');

    if (hasPdfHosting()) {
      return sendReceiptViaTwilio({ fromNumber, toNumber, sale, settings });
    }

    const body = buildTextReceipt(sale, settings);
    return sendTextViaTwilio({ fromNumber, toNumber, body });
  },
  sendText: async ({ provider = 'twilio', fromNumber, toNumber, body }) => {
    if (provider !== 'twilio') throw new Error('Only Twilio provider is implemented');
    return sendTextViaTwilio({ fromNumber, toNumber, body });
  },
};
