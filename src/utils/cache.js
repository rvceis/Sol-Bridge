const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const redis = new Redis(config.redis);

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err);
});

redis.on('close', () => {
  logger.info('Redis connection closed');
});

// Cache wrapper with TTL
const cacheSet = async (key, value, ttl = 3600) => {
  try {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  } catch (error) {
    logger.error('Cache set error:', error);
  }
};

const cacheGet = async (key) => {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Cache get error:', error);
    return null;
  }
};

const cacheDel = async (key) => {
  try {
    await redis.del(key);
  } catch (error) {
    logger.error('Cache delete error:', error);
  }
};

const cacheClear = async (pattern) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    logger.error('Cache clear error:', error);
  }
};

module.exports = {
  redis,
  cacheSet,
  cacheGet,
  cacheDel,
  cacheClear,
};
