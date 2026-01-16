const PredictionService = require('../services/PredictionService');
const PricingService = require('../services/PricingService');
const AnomalyDetector = require('../services/AnomalyDetector');
const logger = require('../utils/logger');

/**
 * Prediction Controller: Handle AI/ML predictions and insights
 */

// Get panel output prediction for a device
exports.getPanelPrediction = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 7 } = req.query;
    const userId = req.user.id;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
    }

    const predictions = await PredictionService.predictPanelOutput(
      deviceId,
      userId,
      parseInt(days)
    );

    res.json({
      status: 'success',
      data: predictions,
    });
  } catch (error) {
    logger.error('Error getting panel prediction:', error);
    res.status(500).json({
      error: 'Failed to get panel prediction',
      message: error.message,
    });
  }
};

// Get consumption prediction for a user
exports.getConsumptionPrediction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;

    const predictions = await PredictionService.predictUserConsumption(
      userId,
      parseInt(days)
    );

    res.json({
      status: 'success',
      data: predictions,
    });
  } catch (error) {
    logger.error('Error getting consumption prediction:', error);
    res.status(500).json({
      error: 'Failed to get consumption prediction',
      message: error.message,
    });
  }
};

// Get prediction accuracy metrics
exports.getPredictionAccuracy = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { days = 30 } = req.query;
    const userId = req.user.id;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
    }

    const accuracy = await PredictionService.getPredictionAccuracy(
      deviceId,
      parseInt(days)
    );

    res.json({
      status: 'success',
      data: {
        deviceId,
        ...accuracy,
        evaluationPeriodDays: days,
      },
    });
  } catch (error) {
    logger.error('Error getting prediction accuracy:', error);
    res.status(500).json({
      error: 'Failed to get prediction accuracy',
      message: error.message,
    });
  }
};

// Store prediction (for batch processing)
exports.storePrediction = async (req, res) => {
  try {
    const { deviceId, userId, type, predictions } = req.body;

    if (!deviceId || !type || !predictions) {
      return res.status(400).json({ 
        error: 'Missing required fields: deviceId, type, predictions' 
      });
    }

    // Validate prediction type
    if (!['panel', 'consumption'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid prediction type. Must be "panel" or "consumption"' 
      });
    }

    const result = await PredictionService.storePredictions(
      deviceId,
      userId || req.user.id,
      type,
      predictions
    );

    res.json({
      status: 'success',
      message: 'Predictions stored successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error storing prediction:', error);
    res.status(500).json({
      error: 'Failed to store prediction',
      message: error.message,
    });
  }
};

// Get pricing recommendation
exports.getPricingRecommendation = async (req, res) => {
  try {
    const userId = req.user.id;

    const recommendation = await PricingService.getPricingRecommendation(userId);

    res.json({
      status: 'success',
      data: recommendation,
    });
  } catch (error) {
    logger.error('Error getting pricing recommendation:', error);
    res.status(500).json({
      error: 'Failed to get pricing recommendation',
      message: error.message,
    });
  }
};

// Get optimal trading times
exports.getOptimalTradingTimes = async (req, res) => {
  try {
    const optimal = await PricingService.getOptimalTradingTimes();

    res.json({
      status: 'success',
      data: optimal,
    });
  } catch (error) {
    logger.error('Error getting optimal trading times:', error);
    res.status(500).json({
      error: 'Failed to get optimal trading times',
      message: error.message,
    });
  }
};

// Calculate dynamic price
exports.calculateDynamicPrice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { energyAmount, duration = 'daily' } = req.body;

    if (!energyAmount) {
      return res.status(400).json({ error: 'Energy amount required' });
    }

    const pricing = await PricingService.calculateDynamicPrice(
      userId,
      parseFloat(energyAmount),
      duration
    );

    res.json({
      status: 'success',
      data: pricing,
    });
  } catch (error) {
    logger.error('Error calculating dynamic price:', error);
    res.status(500).json({
      error: 'Failed to calculate dynamic price',
      message: error.message,
    });
  }
};

// Detect panel degradation
exports.detectDegradation = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
    }

    const analysis = await AnomalyDetector.detectDegradation(deviceId, userId);

    res.json({
      status: 'success',
      data: analysis,
    });
  } catch (error) {
    logger.error('Error detecting degradation:', error);
    res.status(500).json({
      error: 'Failed to detect degradation',
      message: error.message,
    });
  }
};

// Detect equipment failure
exports.detectEquipmentFailure = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID required' });
    }

    const analysis = await AnomalyDetector.detectEquipmentFailure(deviceId, userId);

    res.json({
      status: 'success',
      data: analysis,
    });
  } catch (error) {
    logger.error('Error detecting equipment failure:', error);
    res.status(500).json({
      error: 'Failed to detect equipment failure',
      message: error.message,
    });
  }
};

// Get anomaly alerts
exports.getAnomalyAlerts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { resolved = false } = req.query;

    const alerts = await AnomalyDetector.getUserAnomalyAlerts(
      userId,
      resolved === 'true'
    );

    res.json({
      status: 'success',
      data: alerts,
    });
  } catch (error) {
    logger.error('Error getting anomaly alerts:', error);
    res.status(500).json({
      error: 'Failed to get anomaly alerts',
      message: error.message,
    });
  }
};

// Resolve anomaly alert
exports.resolveAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;
    const { resolutionNotes } = req.body;

    const result = await AnomalyDetector.resolveAlert(
      alertId,
      userId,
      resolutionNotes || ''
    );

    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    logger.error('Error resolving alert:', error);
    res.status(500).json({
      error: 'Failed to resolve alert',
      message: error.message,
    });
  }
};
