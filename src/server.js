const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('express-async-errors');
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler: oldErrorHandler } = require('./utils/errors');
const { errorHandler, responseMiddleware } = require('./utils/response');
const { authenticate, createRateLimiter, corsOptions } = require('./middleware/auth');
const db = require('./database');
const { createSchema } = require('./database/schema');
const { redis, redisAvailable } = require('./utils/cache');

// Routes
const authRoutes = require('./routes/authRoutes');
const iotRoutes = require('./routes/iotRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const profileRoutes = require('./routes/profileRoutes');
const marketplaceRoutes = require('./routes/marketplaceRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const locationRoutes = require('./routes/locationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const notificationRoutes = require('./routes/notifications');
const profileKYCRoutes = require('./routes/profile');
const bankAccountRoutes = require('./routes/bankAccounts');
const withdrawalRoutes = require('./routes/withdrawals');

// Services
const iotService = require('./services/IoTDataService');

const app = express();

// ===== Middleware Setup =====

// Security
app.use(helmet());
app.use(cors(corsOptions));

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Custom request logging (cleaner than pinoHttp)
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 500 ? '🔴' : res.statusCode >= 400 ? '🟡' : '🟢';
    
    logger.info(
      `${statusColor} ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - User: ${req.user?.id || 'anonymous'}`
    );
  });
  
  next();
});

// Standard Response Middleware
app.use(responseMiddleware);

// Rate limiting (if Redis available)
if (redisAvailable()) {
  const rateLimiter = createRateLimiter(redis, config.rateLimit.windowMs, config.rateLimit.maxRequests);
  app.use('/api/', rateLimiter);
} else {
  logger.warn('Rate limiting disabled (requires Redis)');
}

// ===== Health Check =====
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ===== API Routes =====
app.use(`/api/${config.apiVersion}`, authRoutes);
app.use(`/api/${config.apiVersion}`, iotRoutes);
app.use(`/api/${config.apiVersion}`, transactionRoutes);
app.use(`/api/${config.apiVersion}/users`, profileRoutes);
app.use(`/api/${config.apiVersion}/marketplace`, marketplaceRoutes);
app.use(`/api/${config.apiVersion}/devices`, deviceRoutes);
app.use(`/api/${config.apiVersion}/location`, locationRoutes);
app.use(`/api/${config.apiVersion}/payment`, paymentRoutes);
app.use(`/api/${config.apiVersion}/verification`, verificationRoutes);
app.use(`/api/${config.apiVersion}/notifications`, notificationRoutes);
app.use(`/api/${config.apiVersion}/profile`, profileKYCRoutes);
app.use(`/api/${config.apiVersion}/bank-accounts`, bankAccountRoutes);
app.use(`/api/${config.apiVersion}/withdrawals`, withdrawalRoutes);

// ===== 404 Handler =====
app.use((req, res) => {
  res.status(404).json({
    error: 'NotFoundError',
    message: 'Endpoint not found',
    path: req.path,
  });
});

// ===== Error Handler =====
app.use(errorHandler);

// ===== Server Initialization =====
const startServer = async () => {
  try {
    logger.info(`Starting Solar Sharing Platform Backend - ${config.nodeEnv}`);

    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Initialize database schema
    await createSchema();

    // Initialize IoT Service (MQTT connection)
    try {
      await iotService.initialize();
      logger.info('IoT Service initialized successfully');
    } catch (error) {
      logger.warn('IoT Service initialization failed, continuing without MQTT:', error.message);
    }

    // Start server
    const PORT = config.port;
    const server = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`API version: ${config.apiVersion}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, closing connections...');

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await iotService.close();
        } catch (err) {
          logger.warn('Error closing IoT service:', err);
        }

        await db.closePool();
        
        if (redis) {
          await redis.quit();
        }

        logger.info('All connections closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after 30 seconds');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start if not imported as module
if (require.main === module) {
  startServer();
}

module.exports = app;
