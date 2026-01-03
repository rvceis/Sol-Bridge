const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

// Create connection pool
const pool = new Pool(config.database);

// Handle errors
pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

// Test connection on startup
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
};

// Query wrapper with logging
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`Slow query executed (${duration}ms): ${text.substring(0, 50)}...`);
    }
    return result;
  } catch (error) {
    logger.error('Query error:', error, { query: text, params });
    throw error;
  }
};

// Transaction wrapper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get client for manual transaction handling
const getClient = async () => {
  return await pool.connect();
};

// Close pool
const closePool = async () => {
  await pool.end();
  logger.info('Database pool closed');
};

module.exports = {
  pool,
  query,
  transaction,
  getClient,
  testConnection,
  closePool,
};
