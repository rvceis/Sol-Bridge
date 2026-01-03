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
const { redis } = require('./utils/cache');

// Routes
const authRoutes = require('./routes/authRoutes');
const iotRoutes = require('./routes/iotRoutes');
const transactionRoutes = require('./routes/transactionRoutes');

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

// Logging
app.use(pinoHttp({ logger }));

// Standard Response Middleware
app.use(responseMiddleware);

// Rate limiting
const rateLimiter = createRateLimiter(redis, config.rateLimit.windowMs, config.rateLimit.maxRequests);
app.use('/api/', rateLimiter);

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
        await redis.quit();

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
