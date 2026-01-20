const express = require('express');
const router = express.Router();
const iotManager = require('../services/iotManager');
const logger = require('../utils/logger');
const iotController = require('../controllers/iotController');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/iot/devices - Register new device
 */
router.post('/devices', async (req, res) => {
  try {
    const { device_id, name, location_id, capacity_kw } = req.body;

    // Generate device_id if not provided
    const finalDeviceId = device_id || `DEV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const device = iotManager.registerDevice({
      device_id: finalDeviceId,
      name,
      location_id,
      capacity_kw,
    });

    res.status(201).json({
      success: true,
      device,
      mqtt_topic: `solar/${finalDeviceId}/data`,
    });
  } catch (err) {
    logger.error('Device registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/iot/devices - List all devices
 */
router.get('/devices', (req, res) => {
  try {
    const devices = iotManager.getAllDevices();
    res.json({
      count: devices.length,
      devices,
    });
  } catch (err) {
    logger.error('List devices error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/iot/devices/:deviceId - Get device details
 */
router.get('/devices/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = iotManager.getDevice(deviceId);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(device);
  } catch (err) {
    logger.error('Get device error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/iot/devices/:deviceId/forecast - Get latest forecast
 */
router.get('/devices/:deviceId/forecast', (req, res) => {
  try {
    const { deviceId } = req.params;
    const forecast = iotManager.getDeviceForecast(deviceId);

    if (!forecast) {
      return res.status(404).json({ error: 'No forecast available' });
    }

    res.json({
      device_id: deviceId,
      forecast,
    });
  } catch (err) {
    logger.error('Get forecast error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/iot/devices/:deviceId/command - Send command to device
 */
router.post('/devices/:deviceId/command', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'command required' });
    }

    const device = iotManager.getDevice(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const success = iotManager.sendCommand(deviceId, command);

    res.json({
      success,
      device_id: deviceId,
      command,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error('Send command error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/iot/health - IoT service health check
 */
router.get('/health', (req, res) => {
  try {
    const devices = iotManager.getAllDevices();
    const onlineCount = devices.filter((d) => d.status === 'online').length;

    res.json({
      status: 'ok',
      mqtt_connected: iotManager.mqttClient?.connected || false,
      total_devices: devices.length,
      online_devices: onlineCount,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error('Health check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/iot/ingest - Ingest a single device reading via HTTP
 * Body schema:
 * {
 *   "device_id": "DEV_123",
 *   "timestamp": "2026-01-19T10:00:00Z",
 *   "measurements": {
 *     "power_kw": 1.23,
 *     "energy_kwh": 0.01,
 *     "voltage": 230.1,
 *     "current": 5.3,
 *     "frequency": 50.0,
 *     "temperature": 31.2
 *   }
 * }
 */
router.post('/iot/ingest', (req, res, next) => {
  // Simple guard: require at least device_id and measurements
  if (!req.body?.device_id || !req.body?.measurements) {
    return res.status(400).json({
      success: false,
      error: 'ValidationError',
      message: 'device_id and measurements are required',
    });
  }
  return iotController.ingestData(req, res, next);
});

/**
 * GET /api/iot/readings/latest - Latest reading for the authenticated user
 * Note: If auth is disabled in your environment, this will return cached reading when available.
 */
// Protected: requires user auth for personalized readings
router.get('/iot/readings/latest', authenticate, (req, res, next) => iotController.getLatestReading(req, res, next));

/**
 * GET /api/iot/readings/history - Reading history for authenticated user
 */
router.get('/iot/readings/history', authenticate, (req, res, next) => iotController.getReadingHistory(req, res, next));

/**
 * GET /api/iot/production/device/:deviceId - Get production data for a specific device
 * Query params: startDate, endDate, interval (hourly|daily|weekly)
 */
router.get('/iot/production/device/:deviceId', authenticate, (req, res, next) => iotController.getDeviceProduction(req, res, next));

/**
 * GET /api/iot/production/combined - Get combined production for all user's devices
 * Query params: startDate, endDate, interval (hourly|daily|weekly)
 */
router.get('/iot/production/combined', authenticate, (req, res, next) => iotController.getCombinedProduction(req, res, next));

/**
 * GET /api/iot/device/:deviceId/latest - Get latest real-time reading for a device
 */
router.get('/iot/device/:deviceId/latest', authenticate, (req, res, next) => iotController.getDeviceLatestReading(req, res, next));

/**
 * GET /api/iot/device/:deviceId/raw - Get raw readings for analytics (no aggregation)
 * Query params: startDate, endDate, limit
 */
router.get('/iot/device/:deviceId/raw', authenticate, (req, res, next) => iotController.getRawReadings(req, res, next));

/**
 * GET /api/iot/raw - Get all raw readings for user (no aggregation)
 * Query params: startDate, endDate, limit
 */
router.get('/iot/raw', authenticate, (req, res, next) => {
  req.params.deviceId = null; // Clear deviceId for combined readings
  iotController.getRawReadings(req, res, next);
});

/**
 * GET /api/weather/solar-radiation - Get solar radiation at user's device location (daytime only)
 */
router.get('/weather/solar-radiation', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const hour = now.getHours();

    // Only return solar radiation during daytime (6 AM - 6 PM)
    if (hour < 6 || hour > 18) {
      return res.json({
        success: true,
        data: null,
        message: 'Solar radiation data only available during daytime (6 AM - 6 PM)',
      });
    }

    // Get user's primary device location
    const deviceRes = await db.query(
      `SELECT location FROM devices WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (!deviceRes.rows.length) {
      return res.json({
        success: true,
        data: null,
        message: 'No device with location found',
      });
    }

    const location = deviceRes.rows[0].location;
    if (!location || !location.lat || !location.lon) {
      return res.json({
        success: true,
        data: null,
        message: 'Device location not set',
      });
    }

    // Call OpenWeather API for solar radiation
    const openWeatherKey = process.env.OPENWEATHER_API_KEY;
    if (!openWeatherKey) {
      return res.json({
        success: true,
        data: null,
        message: 'Weather service not configured',
      });
    }

    const fetch = (await import('node-fetch')).default;
    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/3.0/stations?lat=${location.lat}&lon=${location.lon}&appid=${openWeatherKey}`
    );
    
    if (!weatherRes.ok) {
      throw new Error('Weather API failed');
    }

    const weatherData = await weatherRes.json();

    res.json({
      success: true,
      data: {
        uvi: weatherData.uvi || 0,
        radiation_watts: Math.round((weatherData.uvi || 0) * 100), // Rough approximation
        timestamp: new Date().toISOString(),
        location: {
          lat: location.lat,
          lon: location.lon,
        },
      },
    });
  } catch (error) {
    logger.error('Solar radiation error:', error);
    res.status(500).json({
      success: false,
      error: 'WeatherServiceError',
      message: error.message,
    });
  }
});

module.exports = router;
