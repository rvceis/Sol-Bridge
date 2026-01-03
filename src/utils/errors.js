const logger = require('./logger');

class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource', id = null) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Too many requests', 429);
    this.retryAfter = retryAfter;
    this.name = 'RateLimitError';
  }
}

const errorHandler = (err, req, res, next) => {
  // Log error
  if (err instanceof AppError) {
    logger.warn({
      error: err.name,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error({
      error: err.name || 'UnknownError',
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  // Handle AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      ...(err.details && { details: err.details }),
      ...(err instanceof RateLimitError && { retryAfter: err.retryAfter }),
    });
  }

  // Database errors
  if (err.code === 'ER_DUP_ENTRY' || err.code === '23505') {
    return res.status(409).json({
      error: 'ConflictError',
      message: 'Resource already exists',
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid reference to related resource',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'AuthenticationError',
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'AuthenticationError',
      message: 'Token expired',
    });
  }

  // Generic error
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { details: err.message }),
  });
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  asyncHandler,
};
