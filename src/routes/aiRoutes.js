const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'https://solbridge-ai.onrender.com';

/**
 * GET /api/ai/forecast/solar - Solar generation forecast for next 24 hours
 */
router.get('/ai/forecast/solar', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { hours = 24 } = req.query;

    // Call ML service
    const response = await axios.get(`${ML_SERVICE_URL}/api/forecast/solar`, {
      params: {
        user_id: userId,
        hours: parseInt(hours),
      },
      timeout: 10000,
    });

    res.json({
      success: true,
      data: response.data.data || [],
    });
  } catch (error) {
    logger.error('Solar forecast error:', error.message);
    res.status(500).json({
      success: false,
      error: 'ForecastError',
      message: error.message,
    });
  }
});

/**
 * GET /api/ai/forecast/demand - Energy demand forecast for next 24 hours
 */
router.get('/ai/forecast/demand', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { hours = 24 } = req.query;

    // Call ML service
    const response = await axios.get(`${ML_SERVICE_URL}/api/forecast/demand`, {
      params: {
        user_id: userId,
        hours: parseInt(hours),
      },
      timeout: 10000,
    });

    res.json({
      success: true,
      data: response.data.data || [],
    });
  } catch (error) {
    logger.error('Demand forecast error:', error.message);
    res.status(500).json({
      success: false,
      error: 'ForecastError',
      message: error.message,
    });
  }
});

/**
 * GET /api/ai/anomalies - Detect anomalies in device data
 */
router.get('/ai/anomalies', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Call ML service
    const response = await axios.get(`${ML_SERVICE_URL}/api/anomalies`, {
      params: {
        user_id: userId,
      },
      timeout: 10000,
    });

    res.json({
      success: true,
      data: response.data.data || [],
    });
  } catch (error) {
    logger.error('Anomaly detection error:', error.message);
    res.status(500).json({
      success: false,
      error: 'AnomalyDetectionError',
      message: error.message,
    });
  }
});

/**
 * GET /api/ai/health - Check ML service health
 */
router.get('/ai/health', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/health`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      status: response.status === 200 ? 'healthy' : 'degraded',
      ml_service: response.data,
    });
  } catch (error) {
    logger.warn('ML service health check failed:', error.message);
    res.json({
      success: false,
      status: 'unhealthy',
      message: 'ML service unreachable',
    });
  }
});

module.exports = router;
