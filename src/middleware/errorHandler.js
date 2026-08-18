exports.errorHandler = (err, req, res, next) => {
  console.error(err);

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'That username or email is already in use. Please choose another one.',
    });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(422).json({
      message: err.message.replace(/^Validation error:\s*/i, ''),
    });
  }

  const status = err.status || 500;

  if (status >= 500) {
    return res.status(status).json({ message: 'Internal server error' });
  }

  const message = err.message || 'Request failed';
  res.status(status).json({ message });
};
