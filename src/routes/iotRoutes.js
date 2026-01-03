const express = require('express');
const router = express.Router();
const iotController = require('../controllers/iotController');
const { authenticate } = require('../middleware/auth');

// Public endpoint for IoT devices (would need device auth)
router.post('/iot/ingest', iotController.ingestData);

// Protected endpoints
router.get('/iot/latest/:userId', authenticate, iotController.getLatestReading);
router.get('/iot/history/:userId', authenticate, iotController.getReadingHistory);
router.post('/iot/devices/register', authenticate, iotController.registerDevice);
router.post('/iot/devices/:deviceId/command', authenticate, iotController.sendCommand);

module.exports = router;
