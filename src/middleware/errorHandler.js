exports.errorHandler = (err, req, res, next) => {
  const status = Number(err.status || err.statusCode || 500);
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const publicMessage = status < 500 ? err.message : 'Internal server error';

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);

  res.status(status).json({
    message: isProduction ? publicMessage : (err.message || 'Internal server error'),
  });
};
