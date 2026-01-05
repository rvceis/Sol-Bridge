const express = require('express');
const router = express.Router();
const iotController = require('../controllers/iotController');
const { authenticate } = require('../middleware/auth');

// Public endpoint for IoT devices (would need device auth)
router.post('/iot/ingest', iotController.ingestData);

// Protected endpoints - get userId from authenticated user
router.get('/iot/latest', authenticate, iotController.getLatestReading);
router.get('/iot/history', authenticate, iotController.getReadingHistory);

// Device Management endpoints
router.post('/iot/devices', authenticate, iotController.registerDevice);
router.get('/iot/devices', authenticate, iotController.getDevices);
router.get('/iot/devices/:deviceId', authenticate, iotController.getDevice);
router.put('/iot/devices/:deviceId', authenticate, iotController.updateDevice);
router.delete('/iot/devices/:deviceId', authenticate, iotController.deleteDevice);

// Device command endpoint
router.post('/iot/devices/:deviceId/command', authenticate, iotController.sendCommand);

module.exports = router;
