const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { authenticate } = require('../middleware/auth');

// Protected routes (require authentication)
router.get('/my-devices', authenticate, (req, res) => deviceController.getMyDevices(req, res));
router.post('/', authenticate, (req, res) => deviceController.createDevice(req, res));
router.put('/:deviceId', authenticate, (req, res) => deviceController.updateDevice(req, res));
router.delete('/:deviceId', authenticate, (req, res) => deviceController.deleteDevice(req, res));

// Public routes
router.get('/', (req, res) => deviceController.getAllDevices(req, res));
router.get('/:deviceId', (req, res) => deviceController.getDeviceById(req, res));

module.exports = router;
