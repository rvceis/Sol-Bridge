const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { authenticate } = require('../middleware/auth');

/**
 * Prediction Routes: AI/ML predictions and insights
 * All routes require authentication
 */

// GET /api/v1/devices/:deviceId/prediction - Get panel output prediction
router.get(
  '/devices/:deviceId/prediction',
  authenticate,
  predictionController.getPanelPrediction
);

// GET /api/v1/devices/:deviceId/prediction/accuracy - Get prediction accuracy metrics
router.get(
  '/devices/:deviceId/prediction/accuracy',
  authenticate,
  predictionController.getPredictionAccuracy
);

// GET /api/v1/users/consumption-forecast - Get consumption prediction
router.get(
  '/users/consumption-forecast',
  authenticate,
  predictionController.getConsumptionPrediction
);

// POST /api/v1/predictions - Store predictions (for batch/cron jobs)
router.post(
  '/predictions',
  authenticate,
  predictionController.storePrediction
);

// GET /api/v1/pricing/recommendation - Get pricing recommendation
router.get(
  '/pricing/recommendation',
  authenticate,
  predictionController.getPricingRecommendation
);

// GET /api/v1/pricing/optimal-times - Get optimal trading times
router.get(
  '/pricing/optimal-times',
  authenticate,
  predictionController.getOptimalTradingTimes
);

// POST /api/v1/pricing/calculate - Calculate dynamic price
router.post(
  '/pricing/calculate',
  authenticate,
  predictionController.calculateDynamicPrice
);

// GET /api/v1/devices/:deviceId/health/degradation - Detect panel degradation
router.get(
  '/devices/:deviceId/health/degradation',
  authenticate,
  predictionController.detectDegradation
);

// GET /api/v1/devices/:deviceId/health/failure - Detect equipment failure
router.get(
  '/devices/:deviceId/health/failure',
  authenticate,
  predictionController.detectEquipmentFailure
);

// GET /api/v1/anomaly-alerts - Get user's anomaly alerts
router.get(
  '/anomaly-alerts',
  authenticate,
  predictionController.getAnomalyAlerts
);

// PUT /api/v1/anomaly-alerts/:alertId/resolve - Resolve anomaly alert
router.put(
  '/anomaly-alerts/:alertId/resolve',
  authenticate,
  predictionController.resolveAlert
);

module.exports = router;
