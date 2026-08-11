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


async function sendTextViaTwilio({ fromNumber, toNumber, body }) {
  if (!twilioClient) throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');

  const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
  const to = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

  const message = await twilioClient.messages.create({ from, to, body });
  return message;
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

module.exports = {
  sendReceipt: async ({ provider = 'twilio', fromNumber, toNumber, sale, settings }) => {
    if (provider !== 'twilio') throw new Error('Only Twilio provider is implemented');
    return sendReceiptViaTwilio({ fromNumber, toNumber, sale, settings });
  },
  sendText: async ({ provider = 'twilio', fromNumber, toNumber, body }) => {
    if (provider !== 'twilio') throw new Error('Only Twilio provider is implemented');
    return sendTextViaTwilio({ fromNumber, toNumber, body });
  },
};
