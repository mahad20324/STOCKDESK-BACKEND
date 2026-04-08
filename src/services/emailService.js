const nodemailer = require('nodemailer');

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing required email configuration: ${name}`);
    error.status = 500;
    throw error;
  }
  return value;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: getRequiredEnv('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: getRequiredEnv('SMTP_USER'),
      pass: getRequiredEnv('SMTP_PASSWORD'),
    },
  });
}

function getEmailProvider() {
  if (process.env.BREVO_API_KEY) {
    return 'brevo-api';
  }

  return 'smtp';
}

function buildVerificationUrl(token) {
  const baseUrl = process.env.VERIFY_EMAIL_BASE_URL || 'http://localhost:4000/api/auth/verify-email';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

function buildVerificationEmail({ name, shopName, verificationUrl }) {
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:32px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.08);">
        <div style="background:linear-gradient(135deg,#0f766e,#1f7a8c);padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.78;">StockDesk</div>
          <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">Verify Your Email</h1>
          <p style="margin:12px 0 0;font-size:15px;opacity:0.9;">Activate administrator access for ${shopName}.</p>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello ${name},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Your new shop has been created, but administrator access stays locked until you confirm your email address.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Click the button below to verify your email and activate access to StockDesk.</p>
          <div style="margin:28px 0;">
            <a href="${verificationUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:600;">Verify Email</a>
          </div>
          <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.7;">If the button does not work, copy and open this link:</p>
          <p style="margin:0 0 20px;font-size:13px;word-break:break-word;color:#0f766e;">${verificationUrl}</p>
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7;">If you did not request this account, you can ignore this email.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Hello ${name},`,
    '',
    `Your shop ${shopName} has been created. Verify your email to activate administrator access:`,
    verificationUrl,
    '',
    'If you did not request this account, you can ignore this email.',
  ].join('\n');

  return {
    subject: `Verify your email for ${shopName}`,
    html,
    text,
  };
}

async function sendViaBrevoApi({ to, subject, html, text, fromEmail, fromName }) {
  const apiKey = getRequiredEnv('BREVO_API_KEY');

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: fromName,
        email: fromEmail,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    const error = new Error(`Brevo API request failed with status ${response.status}`);
    error.status = 502;
    error.code = 'BREVO_API_ERROR';
    error.response = responseText;
    error.responseCode = response.status;
    throw error;
  }
}

async function sendViaSmtp({ to, subject, html, text, fromEmail, fromName }) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    text,
  });
}

async function sendVerificationEmail({ to, name, shopName, token }) {
  const provider = getEmailProvider();
  const verificationUrl = buildVerificationUrl(token);
  const fromEmail = getRequiredEnv('SMTP_FROM_EMAIL');
  const fromName = process.env.SMTP_FROM_NAME || 'StockDesk';
  const { subject, html, text } = buildVerificationEmail({ name, shopName, verificationUrl });

  console.log(`Sending verification email using provider: ${provider}`);

  if (provider === 'brevo-api') {
    await sendViaBrevoApi({
      to,
      subject,
      html,
      text,
      fromEmail,
      fromName,
    });
  } else {
    await sendViaSmtp({
      to,
      subject,
      html,
      text,
      fromEmail,
      fromName,
    });
  }

  return verificationUrl;
}

module.exports = {
  sendVerificationEmail,
};