const { verifyAccessToken, extractToken } = require('../utils/auth');
const { AuthenticationError, AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');

// Authentication middleware
const authenticate = (req, res, next) => {
  try {
    const token = extractToken(req.headers.authorization);
    
    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(401).json({
        error: 'AuthenticationError',
        message: error.message,
      });
    }
    next(error);
  }
};

// Authorization middleware
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'AuthenticationError',
        message: 'User not authenticated',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'AuthorizationError',
        message: 'Insufficient permissions',
      });
    }

    next();
  };
};

// Rate limiting middleware
const createRateLimiter = (redis, windowMs = 60000, maxRequests = 100) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const key = `ratelimit:${req.user.id}:${req.path}:${Math.floor(Date.now() / windowMs)}`;
    
    try {
      const count = await redis.incr(key);
      
      if (count === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      res.set('X-RateLimit-Limit', maxRequests);
      res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - count));

      if (count > maxRequests) {
        res.set('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({
          error: 'RateLimitError',
          message: 'Too many requests',
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error:', error);
      next(); // Allow request on error
    }
  };
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || 'anonymous',
    });
  });

  next();
};

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

module.exports = {
  authenticate,
  authorize,
  createRateLimiter,
  requestLogger,
  corsOptions,
};
