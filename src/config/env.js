function validateEnvironment() {
  const errors = [];
  const warnings = [];
  const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
  const jwtSecret = process.env.JWT_SECRET ? String(process.env.JWT_SECRET).trim() : '';

  if (!jwtSecret) {
    errors.push('JWT_SECRET is required.');
  } else if (jwtSecret.length < 24) {
    warnings.push('JWT_SECRET is shorter than 24 characters. Use a longer secret in production.');
  }

  if (nodeEnv === 'production' && !process.env.CORS_ORIGINS && !process.env.CORS_ORIGIN_PATTERNS) {
    warnings.push('No production CORS allowlist is configured. Set CORS_ORIGINS or CORS_ORIGIN_PATTERNS.');
  }

  if (process.env.SUPERADMIN_USERNAME && !process.env.SUPERADMIN_PASSWORD) {
    warnings.push('SUPERADMIN_USERNAME is set without SUPERADMIN_PASSWORD. Owner bootstrap will be skipped.');
  }

  if (errors.length > 0) {
    const error = new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
    error.status = 500;
    throw error;
  }

  return { warnings };
}

module.exports = {
  validateEnvironment,
};