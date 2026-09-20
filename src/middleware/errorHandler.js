export const notFound = (req, _res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  // Mongoose validation → { message, errors: { field: message } }
  if (err.name === 'ValidationError') {
    const errors = {};
    Object.values(err.errors).forEach((e) => {
      errors[e.path] = e.message;
    });
    return res.status(400).json({ message: 'Please check the highlighted fields', errors });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid identifier or value supplied' });
  }

  if (err.code === 11000) {
    return res.status(409).json({ message: 'A record with these details already exists' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);

  res.status(status).json({
    message:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Something went wrong on our side. Please try again.'
        : err.message,
  });
};
