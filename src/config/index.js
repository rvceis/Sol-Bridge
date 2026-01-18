require('dotenv').config();

module.exports = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  apiVersion: process.env.API_VERSION || 'v1',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'solar_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    min: parseInt(process.env.DB_POOL_MIN, 10) || 5,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRY || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '30d',
  },

  // MQTT
  mqtt: {
    enabled: process.env.MQTT_ENABLED === 'true', // Disabled by default
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || 'iot_user',
    password: process.env.MQTT_PASSWORD || 'iot_password',
    topicPrefix: process.env.MQTT_TOPIC_PREFIX || 'energy/',
    qos: 1,
    reconnectPeriod: 5000,
  },

  // Email
  email: {
    service: process.env.EMAIL_SERVICE || 'sendgrid',
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.EMAIL_FROM || 'noreply@solarsharingplatform.com',
  },

  // SMS
  sms: {
    service: process.env.SMS_SERVICE || 'twilio',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // Payment Gateway
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  // External APIs
  weather: {
    apiKey: process.env.WEATHER_API_KEY,
    endpoint: process.env.WEATHER_API_ENDPOINT || 'https://api.openweathermap.org/data/2.5/forecast',
  },

  // ML Services
  mlService: {
    url: process.env.ML_SERVICE_URL || 'http://localhost:8001',
    timeout: parseInt(process.env.ML_SERVICE_TIMEOUT, 10) || 30000,
    retries: parseInt(process.env.ML_SERVICE_RETRIES, 10) || 3,
    enabled: process.env.ML_SERVICE_ENABLED !== 'false',
  },

  optimizationService: {
    url: process.env.OPTIMIZATION_SERVICE_URL || 'http://localhost:8002',
    timeout: 60000,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'pretty', // Use 'json' for production
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    limits: {
      regular: 100,
      iot: 10,
      admin: 1000,
    },
  },

  // Sentry
  sentry: {
    dsn: process.env.SENTRY_DSN,
  },

  // Admin
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@solarsharingplatform.com',
  },

  // Feature Flags
  features: {
    enableOptimization: process.env.ENABLE_OPTIMIZATION !== 'false',
    enableAnomalyDetection: process.env.ENABLE_ANOMALY_DETECTION !== 'false',
    enableDynamicPricing: process.env.ENABLE_DYNAMIC_PRICING !== 'false',
  },
};
