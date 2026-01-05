const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let redis = null;
let redisAvailable = false;

try {
  redis = new Redis(config.redis);
  
  redis.on('connect', () => {
    redisAvailable = true;
    logger.info('Redis connected');
  });
  
  redis.on('error', (err) => {
    redisAvailable = false;
    logger.warn('Redis error (caching disabled):', err.message);
  });
  
  redis.on('close', () => {
    redisAvailable = false;
    logger.info('Redis connection closed');
  });
} catch (err) {
  logger.warn('Redis initialization failed, caching disabled:', err.message);
  redisAvailable = false;
}

// Cache wrapper with TTL (gracefully degrades if Redis unavailable)
const cacheSet = async (key, value, ttl = 3600) => {
  if (!redisAvailable || !redis) return;
  try {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  } catch (error) {
    logger.warn('Cache set error:', error.message);
  }
};

const cacheGet = async (key) => {
  if (!redisAvailable || !redis) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.warn('Cache get error:', error.message);
    return null;
  }
};

const cacheDel = async (key) => {
  if (!redisAvailable || !redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    logger.warn('Cache delete error:', error.message);
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
  redisAvailable: () => redisAvailable,
  cacheSet,
  cacheGet,
  cacheDel,
  cacheClear,
};
