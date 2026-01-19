const express = require('express');
const router = express.Router();
const iotManager = require('../services/iotManager');
const logger = require('../utils/logger');
const iotController = require('../controllers/iotController');

/**
 * POST /api/iot/devices - Register new device
 */
router.post('/devices', async (req, res) => {
  try {
    const { device_id, name, location_id, capacity_kw } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'device_id required' });
    }

    const device = iotManager.registerDevice({
      device_id,
      name,
      location_id,
      capacity_kw,
    });

    res.status(201).json({
      success: true,
      device,
      mqtt_topic: `solar/${device_id}/data`,
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
router.get('/iot/readings/latest', (req, res, next) => iotController.getLatestReading(req, res, next));

/**
 * GET /api/iot/readings/history - Reading history for authenticated user
 */
router.get('/iot/readings/history', (req, res, next) => iotController.getReadingHistory(req, res, next));

module.exports = router;
