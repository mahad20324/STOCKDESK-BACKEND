'use strict';

const nodemailer = require('nodemailer');

const APP_URL = (process.env.APP_URL || 'https://app.stockdeskinventory.com').replace(/\/$/, '');
const FROM_NAME  = process.env.SMTP_FROM_NAME  || 'StockDesk';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@stockdeskinventory.com';
const FROM = `"${FROM_NAME}" <${FROM_EMAIL}>`;

// Log SMTP config on load (masks password) so you can verify in Railway logs
console.log('[EmailService] config:', {
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: process.env.SMTP_PORT || '587',
  secure: process.env.SMTP_SECURE || 'false',
  user: process.env.SMTP_USER ? `${String(process.env.SMTP_USER).slice(0, 4)}***` : '(NOT SET)',
  pass: process.env.SMTP_PASSWORD ? '***set***' : '(NOT SET)',
  from: FROM,
  appUrl: APP_URL,
});

// Verify SMTP connection on startup
createTransporter().verify((err) => {
  if (err) {
    console.error('[EmailService] SMTP connection FAILED:', err.message, '| code:', err.code);
  } else {
    console.log('[EmailService] SMTP connection OK — ready to send emails');
  }
});

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>StockDesk</title>
</head>
<body style="margin:0;padding:0;background:#EDF2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF2F7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="580" cellpadding="0" cellspacing="0"
        style="max-width:580px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:#09505F;padding:28px 40px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-left:3px solid #C9A84C;padding-left:14px;">
                  <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.22em;color:#B8DEE8;text-transform:uppercase;">StockDesk</p>
                  <p style="margin:3px 0 0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Inventory &amp; POS Control</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:40px 40px 32px;">${body}</td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F4F8FA;border-top:1px solid #D0DFE8;padding:18px 40px;">
            <p style="margin:0;font-size:11px;color:#8A9BAA;text-align:center;line-height:1.7;">
              &copy; ${new Date().getFullYear()} StockDesk &nbsp;&middot;&nbsp;
              <a href="${APP_URL}" style="color:#0D6E82;text-decoration:none;">stockdeskinventory.com</a><br>
              If you didn&rsquo;t request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#0D6E82;border-radius:10px;box-shadow:0 4px 14px rgba(13,110,130,0.32);">
      <a href="${href}" style="display:block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">${label}</a>
    </td>
  </tr>
</table>`;
}

exports.sendVerificationEmail = async (to, shopName, token) => {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;

  const html = layout(`
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#0F1E2C;letter-spacing:-0.01em;">
      Verify your email address
    </h1>
    <p style="margin:0 0 4px;font-size:15px;color:#4A6070;line-height:1.65;">
      Welcome to StockDesk! Your workspace
      <strong style="color:#0F1E2C;">${escapeHtml(shopName)}</strong>
      is ready. Click the button below to verify your email and activate your admin account.
    </p>
    ${ctaButton(link, 'Verify Email Address')}
    <p style="margin:0 0 6px;font-size:13px;color:#8A9BAA;">
      This link expires in <strong style="color:#4A6070;">24 hours</strong>.
    </p>
    <p style="margin:0;font-size:11px;color:#B0C4CE;word-break:break-all;">
      If the button doesn&rsquo;t work, paste this into your browser:<br>
      <a href="${link}" style="color:#0D6E82;text-decoration:none;">${link}</a>
    </p>
  `);

  const transporter = createTransporter();
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: 'Verify your StockDesk account',
      html,
    });
    console.log('[EmailService] Verification email sent to:', to);
  } catch (err) {
    console.error('[EmailService] FAILED to send verification email. Error:', err.message, '| Code:', err.code, '| Response:', err.response);
    throw err;
  }
};

exports.sendPasswordResetEmail = async (to, shopName, token) => {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const html = layout(`
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#0F1E2C;letter-spacing:-0.01em;">
      Reset your password
    </h1>
    <p style="margin:0 0 4px;font-size:15px;color:#4A6070;line-height:1.65;">
      We received a password reset request for the
      <strong style="color:#0F1E2C;">${escapeHtml(shopName)}</strong>
      admin account. Click the button below to set a new password.
    </p>
    ${ctaButton(link, 'Reset Password')}
    <table role="presentation" cellpadding="0" cellspacing="0"
      style="margin:0 0 16px;background:#FFF8E6;border-left:3px solid #C9A84C;border-radius:6px;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0;font-size:13px;color:#7A5C1A;">
            This link expires in <strong>1 hour</strong>.
            If you didn&rsquo;t request a reset, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:11px;color:#B0C4CE;word-break:break-all;">
      If the button doesn&rsquo;t work, paste this into your browser:<br>
      <a href="${link}" style="color:#0D6E82;text-decoration:none;">${link}</a>
    </p>
  `);

  const transporter = createTransporter();
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: 'Reset your StockDesk password',
      html,
    });
    console.log('[EmailService] Password reset email sent to:', to);
  } catch (err) {
    console.error('[EmailService] FAILED to send password reset email. Error:', err.message, '| Code:', err.code, '| Response:', err.response);
    throw err;
  }
};
