function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, maxRequests, message, keyPrefix }) {
  const buckets = new Map();

  function pruneExpiredEntries(now) {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.expiresAt <= now) {
        buckets.delete(key);
      }
    }
  }

  const pruneTimer = setInterval(() => pruneExpiredEntries(Date.now()), Math.max(windowMs, 60 * 1000));
  pruneTimer.unref();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = `${keyPrefix}:${getClientIp(req)}`;
    const currentBucket = buckets.get(key);

    if (!currentBucket || currentBucket.expiresAt <= now) {
      buckets.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });
      return next();
    }

    currentBucket.count += 1;

    if (currentBucket.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((currentBucket.expiresAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message,
        retryAfterSeconds,
      });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
};