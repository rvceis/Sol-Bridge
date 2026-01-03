/**
 * Standardized API Response Wrapper
 * Ensures all API responses follow consistent format
 */

const logger = require('./logger');

/**
 * Standard success response format
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} Formatted response
 */
const successResponse = (data = null, message = 'Success', statusCode = 200) => {
  return {
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Standard error response format
 * @param {string} errorType - Error type/category
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 * @returns {Object} Formatted response
 */
const errorResponse = (
  errorType = 'InternalServerError',
  message = 'An error occurred',
  statusCode = 500,
  details = null
) => {
  return {
    success: false,
    statusCode,
    error: errorType,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Middleware to use standardized responses
 * Extends res object with helper methods
 */
const responseMiddleware = (req, res, next) => {
  // Success response helper
  res.success = (data = null, message = 'Success', statusCode = 200) => {
    const response = successResponse(data, message, statusCode);
    logger.info({
      type: 'SUCCESS_RESPONSE',
      statusCode,
      message,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });
    return res.status(statusCode).json(response);
  };

  // Error response helper
  res.error = (
    errorType = 'InternalServerError',
    message = 'An error occurred',
    statusCode = 500,
    details = null
  ) => {
    const response = errorResponse(errorType, message, statusCode, details);
    logger.error({
      type: 'ERROR_RESPONSE',
      statusCode,
      error: errorType,
      message,
      details,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });
    return res.status(statusCode).json(response);
  };

  // Paginated response helper
  res.paginated = (data, page, limit, total, message = 'Success') => {
    const response = {
      success: true,
      statusCode: 200,
      message,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString(),
    };
    logger.info({
      type: 'PAGINATED_RESPONSE',
      page,
      limit,
      total,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
    });
    return res.status(200).json(response);
  };

  next();
};

/**
 * Centralized error handler middleware with enhanced logging
 * Should be the last middleware
 */
const errorHandler = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = req.id || 'unknown';
  const userId = req.user?.id || 'anonymous';

  // Default error values
  let statusCode = 500;
  let errorType = 'InternalServerError';
  let message = err.message || 'An unexpected error occurred';
  let details = null;

  // Custom AppError
  if (err.statusCode) {
    statusCode = err.statusCode;
    errorType = err.name || 'AppError';
    details = err.details;
  }

  // Validation errors
  if (err.isJoi) {
    statusCode = 400;
    errorType = 'ValidationError';
    message = err.details?.[0]?.message || 'Validation failed';
    details = err.details?.map(d => ({
      path: d.path.join('.'),
      message: d.message,
    }));
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorType = 'AuthenticationError';
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorType = 'TokenExpired';
    message = 'Token has expired';
  }

  // Database errors
  if (err.code === '23505') {
    // Unique constraint violation
    statusCode = 409;
    errorType = 'ConflictError';
    message = 'Record already exists';
  }

  if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    errorType = 'ValidationError';
    message = 'Invalid reference';
  }

  // Log error with full context
  const errorLog = {
    requestId,
    timestamp,
    statusCode,
    errorType,
    message,
    method: req.method,
    path: req.path,
    userId,
    query: req.query,
    body: sanitizeBody(req.body),
    ip: req.ip,
    userAgent: req.get('user-agent'),
    stack: err.stack,
    details,
  };

  // Log different severity levels
  if (statusCode >= 500) {
    logger.error(errorLog, 'Server Error');
  } else if (statusCode >= 400) {
    logger.warn(errorLog, 'Client Error');
  } else {
    logger.info(errorLog, 'Response Error');
  }

  // Send error response
  const response = errorResponse(errorType, message, statusCode, details);
  res.status(statusCode).json(response);
};

/**
 * Sanitize request body to remove sensitive data before logging
 */
const sanitizeBody = (body) => {
  if (!body) return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'refreshToken'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });

  return sanitized;
};

module.exports = {
  successResponse,
  errorResponse,
  responseMiddleware,
  errorHandler,
  sanitizeBody,
};
