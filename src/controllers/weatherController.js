/**
 * Weather Controller
 * Handles weather and solar irradiance endpoints
 */

const weatherService = require('../services/WeatherService');
const db = require('../database');
const logger = require('../utils/logger');

/**
 * Get current weather for a location
 */
exports.getCurrentWeather = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude'
      });
    }

    const weather = await weatherService.getCurrentWeather(lat, lon);

    res.json({
      success: true,
      data: weather
    });
  } catch (error) {
    logger.error('Error fetching current weather:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch weather data'
    });
  }
};

/**
 * Get weather forecast for a location
 */
exports.getForecast = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude'
      });
    }

    const forecast = await weatherService.getForecast(lat, lon);

    res.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    logger.error('Error fetching weather forecast:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch weather forecast'
    });
  }
};

/**
 * Get solar irradiance forecast
 */
exports.getSolarForecast = async (req, res) => {
  try {
    const { latitude, longitude, hours = 24 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const forecastHours = parseInt(hours);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude'
      });
    }

    if (isNaN(forecastHours) || forecastHours < 1 || forecastHours > 120) {
      return res.status(400).json({
        success: false,
        message: 'Hours must be between 1 and 120'
      });
    }

    const solarData = await weatherService.getSolarForecast(lat, lon, forecastHours);

    res.json({
      success: true,
      data: solarData
    });
  } catch (error) {
    logger.error('Error fetching solar forecast:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch solar forecast'
    });
  }
};

/**
 * Get weather for user's device
 */
exports.getDeviceWeather = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    // Verify device belongs to user
    const deviceQuery = await db.query(
      'SELECT id, name, latitude, longitude FROM devices WHERE id = $1 AND user_id = $2',
      [deviceId, userId]
    );

    if (deviceQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    const device = deviceQuery.rows[0];

    if (!device.latitude || !device.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Device location not configured'
      });
    }

    const weather = await weatherService.getCurrentWeather(
      device.latitude,
      device.longitude
    );

    res.json({
      success: true,
      data: {
        device_id: device.id,
        device_name: device.name,
        location: {
          latitude: device.latitude,
          longitude: device.longitude
        },
        weather: weather
      }
    });
  } catch (error) {
    logger.error('Error fetching device weather:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch device weather'
    });
  }
};

/**
 * Get weather for all user's devices
 */
exports.getAllDevicesWeather = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all user devices with location
    const devicesQuery = await db.query(
      `SELECT id, name, latitude, longitude 
       FROM devices 
       WHERE user_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL`,
      [userId]
    );

    if (devicesQuery.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          devices: [],
          message: 'No devices with location configured'
        }
      });
    }

    const devicesWeather = await weatherService.getDevicesWeather(devicesQuery.rows);

    res.json({
      success: true,
      data: {
        count: devicesWeather.length,
        devices: devicesWeather
      }
    });
  } catch (error) {
    logger.error('Error fetching devices weather:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch devices weather'
    });
  }
};

/**
 * Get solar forecast for device
 */
exports.getDeviceSolarForecast = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    const { hours = 24 } = req.query;

    // Verify device belongs to user
    const deviceQuery = await db.query(
      'SELECT id, name, latitude, longitude, panel_capacity FROM devices WHERE id = $1 AND user_id = $2',
      [deviceId, userId]
    );

    if (deviceQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    const device = deviceQuery.rows[0];

    if (!device.latitude || !device.longitude) {
      return res.status(400).json({
        success: false,
        message: 'Device location not configured'
      });
    }

    const forecastHours = parseInt(hours);
    const solarData = await weatherService.getSolarForecast(
      device.latitude,
      device.longitude,
      forecastHours
    );

    // If panel capacity is known, calculate expected energy production
    if (device.panel_capacity) {
      solarData.solar_data = solarData.solar_data.map(d => ({
        ...d,
        expected_production_kwh: (d.energy_potential * device.panel_capacity).toFixed(3)
      }));

      solarData.summary.total_expected_production = solarData.solar_data
        .reduce((sum, d) => sum + parseFloat(d.expected_production_kwh), 0)
        .toFixed(3);
    }

    res.json({
      success: true,
      data: {
        device_id: device.id,
        device_name: device.name,
        panel_capacity: device.panel_capacity,
        forecast: solarData
      }
    });
  } catch (error) {
    logger.error('Error fetching device solar forecast:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch solar forecast'
    });
  }
};
