/**
 * Weather Routes
 * API endpoints for weather and solar irradiance data
 */

const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weatherController');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/v1/weather/current
 * @desc    Get current weather for a location
 * @access  Public
 * @query   latitude, longitude
 */
router.get('/current', weatherController.getCurrentWeather);

/**
 * @route   GET /api/v1/weather/forecast
 * @desc    Get weather forecast for a location
 * @access  Public
 * @query   latitude, longitude
 */
router.get('/forecast', weatherController.getForecast);

/**
 * @route   GET /api/v1/weather/solar-forecast
 * @desc    Get solar irradiance forecast
 * @access  Public
 * @query   latitude, longitude, hours (optional, default 24)
 */
router.get('/solar-forecast', weatherController.getSolarForecast);

/**
 * @route   GET /api/v1/weather/device/:deviceId
 * @desc    Get current weather for user's device location
 * @access  Private
 */
router.get('/device/:deviceId', authenticate, weatherController.getDeviceWeather);

/**
 * @route   GET /api/v1/weather/devices
 * @desc    Get weather for all user's devices
 * @access  Private
 */
router.get('/devices', authenticate, weatherController.getAllDevicesWeather);

/**
 * @route   GET /api/v1/weather/device/:deviceId/solar-forecast
 * @desc    Get solar forecast for user's device
 * @access  Private
 * @query   hours (optional, default 24)
 */
router.get('/device/:deviceId/solar-forecast', authenticate, weatherController.getDeviceSolarForecast);

/**
 * @route   GET /api/v1/weather/solar-radiation
 * @desc    Get current solar radiation (daytime only)
 * @access  Private
 */
router.get('/solar-radiation', authenticate, weatherController.getSolarRadiation);

module.exports = router;
