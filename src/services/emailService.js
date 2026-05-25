const nodemailer = require('nodemailer');

// ── Provider selection ────────────────────────────────────────────────────────

function getProvider() {
  return process.env.BREVO_API_KEY ? 'brevo' : 'smtp';
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function buildVerificationUrl(token) {
  return `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function buildResetUrl(token) {
  return `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

// ── SMTP transport ────────────────────────────────────────────────────────────

function createSmtpTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

async function sendViaSmtp({ to, subject, html, text }) {
  const fromName = process.env.SMTP_FROM_NAME || 'StockDesk';
  const fromEmail = process.env.SMTP_FROM_EMAIL;
  const transporter = createSmtpTransporter();
  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });
}

// ── Brevo API transport ───────────────────────────────────────────────────────

async function sendViaBrevo({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromName = process.env.SMTP_FROM_NAME || 'StockDesk';
  const fromEmail = process.env.SMTP_FROM_EMAIL;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(text ? { textContent: text } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const err = new Error(`Brevo API error ${response.status}: ${body}`);
    err.status = 502;
    throw err;
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

async function sendEmail(payload) {
  const provider = getProvider();
  console.log(`[emailService] Sending via ${provider} to ${payload.to}`);
  if (provider === 'brevo') {
    await sendViaBrevo(payload);
  } else {
    await sendViaSmtp(payload);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function sendVerificationEmail(to, token, { name, shopName } = {}) {
  const url = buildVerificationUrl(token);
  const displayName = name || 'there';
  const displayShop = shopName || 'StockDesk';

  await sendEmail({
    to,
    subject: `Verify your email for ${displayShop}`,
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
        <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#0f766e,#1f7a8c);padding:28px 32px;color:#fff">
            <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.8">StockDesk</div>
            <h1 style="margin:10px 0 0;font-size:26px">Verify Your Email</h1>
            <p style="margin:10px 0 0;font-size:14px;opacity:.9">Activate administrator access for ${displayShop}</p>
          </div>
          <div style="padding:32px">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Hello ${displayName},</p>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Your new StockDesk shop has been created. Click the button below to verify your email address and activate your account.</p>
            <div style="margin:28px 0">
              <a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:600">Verify Email</a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#475569">If the button doesn't work, paste this link into your browser:</p>
            <p style="margin:0 0 20px;font-size:12px;word-break:break-word;color:#0f766e">${url}</p>
            <p style="margin:0;font-size:13px;color:#64748b">If you didn't create this account, you can ignore this email.</p>
          </div>
        </div>
      </div>
    `,
    text: `Hello ${displayName},\n\nVerify your email for ${displayShop}:\n${url}\n\nIf you didn't create this account, ignore this email.`,
  });
}

async function sendPasswordResetEmail(to, token) {
  const url = buildResetUrl(token);

  await sendEmail({
    to,
    subject: 'Reset your StockDesk password',
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
        <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#0f766e,#1f7a8c);padding:28px 32px;color:#fff">
            <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.8">StockDesk</div>
            <h1 style="margin:10px 0 0;font-size:26px">Reset Your Password</h1>
            <p style="margin:10px 0 0;font-size:14px;opacity:.9">This link expires in 1 hour</p>
          </div>
          <div style="padding:32px">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Click the button below to set a new password for your StockDesk account.</p>
            <div style="margin:28px 0">
              <a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:600">Reset Password</a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#475569">If the button doesn't work, paste this link into your browser:</p>
            <p style="margin:0 0 20px;font-size:12px;word-break:break-word;color:#0f766e">${url}</p>
            <p style="margin:0;font-size:13px;color:#64748b">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    `,
    text: `Reset your StockDesk password:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}

console.log(`[emailService] Provider on boot: ${getProvider()}`);

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
