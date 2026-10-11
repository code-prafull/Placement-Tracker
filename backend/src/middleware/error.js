import ApiError from '../utils/ApiError.js';

export function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate value for a unique field';
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} →`, err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(status >= 500 && process.env.NODE_ENV !== 'production'
      ? { stack: err.stack }
      : {}),
  });
}
