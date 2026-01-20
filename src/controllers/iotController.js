const iotService = require('../services/IoTDataService');
const db = require('../database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/errors');
const { schemas, validate } = require('../utils/validation');
const { cacheGet, cacheSet, cacheDel } = require('../utils/cache');

// Ingest IoT data - Simplified for ESP32 compatibility
const ingestData = asyncHandler(async (req, res) => {
// Get latest reading for a specific device
const getDeviceLatestReading = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { deviceId } = req.params;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Login required' });
  }

  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'deviceId is required' });
  }

  // Verify device belongs to user
  const deviceCheck = await db.query(
    `SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2`,
    [deviceId, userId]
  );

  if (deviceCheck.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'DeviceNotFound', message: 'Device not found or does not belong to you' });
  }

  // Fetch latest reading for this device
  const result = await db.query(
    `SELECT time, power_kw, energy_kwh, voltage, current, frequency, power_factor, battery_soc, temperature
     FROM energy_readings
     WHERE device_id = $1 AND user_id = $2
     ORDER BY time DESC
     LIMIT 1`,
    [deviceId, userId]
  );

  const reading = result.rows[0];

  if (!reading) {
    return res.json({
      success: true,
      data: {
        device_id: deviceId,
        reading: null,
        last_updated: null,
        message: 'No readings found for this device.',
      },
    });
  }

  const powerKw = parseFloat(reading.power_kw) || 0;
  const voltage = parseFloat(reading.voltage) || 0;
  const current = parseFloat(reading.current) || 0;

  res.json({
    success: true,
    data: {
      device_id: deviceId,
      reading: {
        ...reading,
        power_w: powerKw * 1000,
        energy_wh: (parseFloat(reading.energy_kwh) || 0) * 1000,
        voltage,
        current,
      },
      last_updated: reading.time,
    },
  });
});
  let data = req.body;
  
  logger.info(`IoT Ingest received: ${JSON.stringify(data)}`);
  
  // Look up device to get user_id
  if (!data.device_id) {
    return res.status(400).json({
      success: false,
      error: 'ValidationError',
      message: 'device_id is required',
    });
  }
  
  const device = await iotService.getDeviceByIdOnly(data.device_id);
  if (!device) {
    logger.error(`Device not found: ${data.device_id}`);
    return res.status(404).json({
      success: false,
      error: 'DeviceNotFound',
      message: 'Device not registered. Please register device through the app first.',
    });
  }
  
  data.user_id = device.user_id;
  logger.info(`Device ${data.device_id} belongs to user ${device.user_id}`);
  
  // Fix timestamp if invalid (1970 or future)
  const timestamp = new Date(data.timestamp);
  if (isNaN(timestamp.getTime()) || timestamp.getFullYear() < 2020) {
    data.timestamp = new Date().toISOString();
    logger.info(`Fixed invalid timestamp, using server time: ${data.timestamp}`);
  }
  
  // Ensure measurements exist
  if (!data.measurements) {
    return res.status(400).json({
      success: false,
      error: 'ValidationError',
      message: 'measurements object is required',
    });
  }
  
  // Store directly in database - bypass all other validation
  try {
    const measurements = data.measurements;
    
    // Calculate power from voltage and current if not provided
    let powerKw = parseFloat(measurements.power_kw) || 0;
    if (powerKw === 0 && measurements.voltage && measurements.current) {
      // P(W) = V × I, convert to kW
      powerKw = (measurements.voltage * measurements.current) / 1000;
      logger.info(`Calculated power: ${powerKw} kW from V:${measurements.voltage}V × I:${measurements.current}A`);
    }
    
    // For small installations, store energy in Wh instead of kWh for better precision
    const energyKwh = parseFloat(measurements.energy_kwh) || 0;
    
    await db.query(
      `INSERT INTO energy_readings 
       (time, device_id, user_id, measurement_type, power_kw, energy_kwh, voltage, current, 
        frequency, power_factor, battery_soc, battery_voltage, battery_current, temperature, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        data.timestamp,
        data.device_id,
        data.user_id,
        'solar',
        powerKw,
        energyKwh,
        measurements.voltage || 0,
        measurements.current || 0,
        measurements.frequency || 0,
        measurements.power_factor || null,
        measurements.battery_soc || null,
        measurements.battery_voltage || null,
        measurements.battery_current || null,
        measurements.temperature || null,
        JSON.stringify({
          source: 'esp32_solar_sensor',
          calculated_power: powerKw > 0 && !measurements.power_kw,
        }),
      ]
    );
    
    // Update device last_seen
    await db.query(
      `UPDATE devices SET last_seen_at = NOW(), status = 'active' WHERE device_id = $1`,
      [data.device_id]
    );
    
    logger.info(`✅ Data stored: Power=${powerKw}kW, V=${measurements.voltage}V, I=${measurements.current}A`);
    
    res.json({
      status: 'accepted',
      timestamp: new Date().toISOString(),
    });
  } catch (dbError) {
    logger.error(`Database error storing IoT data: ${dbError.message}`);
    logger.error('Stack:', dbError.stack);
    res.status(500).json({
      success: false,
      error: 'DatabaseError',
      message: dbError.message,
    });
  }
});

// Get latest reading - uses authenticated user's ID (with Redis caching)
const getLatestReading = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Login required' });
  }
  const cacheKey = `iot:latest:${userId}`;
  
  // Try cache first (30 second TTL for real-time data)
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
      cached: true
    });
  }
  
  const reading = await iotService.getLatestReading(userId);

  if (!reading) {
    const response = {
      reading: null,
      device: null,
      lastUpdated: new Date().toISOString(),
      message: 'No readings found. Connect a solar device to start tracking.',
    };
    
    // Cache "no data" response for 60 seconds
    await cacheSet(cacheKey, response, 60);
    
    return res.json({
      success: true,
      data: response,
    });
  }

  const response = {
    reading,
    device: reading.device || null,
    lastUpdated: reading.timestamp || new Date().toISOString(),
  };
  
  // Cache reading for 30 seconds (real-time data shouldn't be cached too long)
  await cacheSet(cacheKey, response, 30);
  
  res.json({
    success: true,
    data: response,
  });
});

// Get reading history - uses authenticated user's ID
const getReadingHistory = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Login required' });
  }
  const {
    startDate,
    endDate,
    interval = 'hourly',
    limit = 1000,
  } = req.query;

  // Default to today if no dates provided
  const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = endDate ? new Date(endDate) : new Date();

  const readings = await iotService.getReadingHistory(
    userId,
    start,
    end,
    interval
  );

  res.json({
    success: true,
    data: {
      readings: readings.slice(0, parseInt(limit)),
      summary: {
        totalGeneration: readings.reduce((sum, r) => sum + (r.powerOutput || 0), 0) / 1000, // Convert to kWh
        totalConsumption: readings.reduce((sum, r) => sum + (r.powerConsumed || 0), 0) / 1000,
        avgEfficiency: readings.length > 0 ? readings.reduce((sum, r) => sum + (r.efficiency || 0), 0) / readings.length : 0,
      },
      pagination: {
        page: 1,
        limit: parseInt(limit),
        total: readings.length,
        totalPages: 1,
      },
    },
  });
});

// Register device
const registerDevice = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { deviceType, deviceModel, firmwareVersion } = req.body;

  if (!deviceType) {
    return res.status(400).json({
      success: false,
      error: 'ValidationError',
      message: 'deviceType is required',
    });
  }

  const validTypes = ['solar_meter', 'consumption_meter', 'battery_bms', 'weather_station'];
  if (!validTypes.includes(deviceType)) {
    return res.status(400).json({
      success: false,
      error: 'ValidationError',
      message: 'Invalid deviceType. Must be one of: ' + validTypes.join(', '),
    });
  }

  const device = await iotService.registerDevice({
    userId,
    deviceType,
    deviceModel,
    firmwareVersion,
  });

  res.json({
    success: true,
    data: {
      device,
      message: 'Device registered successfully',
    },
  });
});

// Get all devices for user
const getDevices = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const devices = await iotService.getUserDevices(userId);

  res.json({
    success: true,
    data: {
      devices,
      count: devices.length,
    },
  });
});

// Get single device
const getDevice = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { deviceId } = req.params;

  const device = await iotService.getDeviceById(deviceId, userId);

  if (!device) {
    return res.status(404).json({
      success: false,
      error: 'NotFoundError',
      message: 'Device not found',
    });
  }

  res.json({
    success: true,
    data: { device },
  });
});

// Update device
const updateDevice = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { deviceId } = req.params;
  const { deviceModel, status, configuration } = req.body;

  const device = await iotService.updateDevice(deviceId, userId, {
    deviceModel,
    status,
    configuration,
  });

  res.json({
    success: true,
    data: { device },
  });
});

// Delete device
const deleteDevice = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { deviceId } = req.params;

  await iotService.deleteDevice(deviceId, userId);

  res.json({
    success: true,
    message: 'Device deleted successfully',
  });
});

// Send command to device
const sendCommand = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { command, value } = req.body;

  if (!command) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'command is required',
    });
  }

  await iotService.sendCommand(req.user.id, deviceId, command, value);

  res.json({
    status: 'sent',
    device_id: deviceId,
    command,
    value,
  });
});

// Get device production (single device)
const getDeviceProduction = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { deviceId } = req.params;
  const { startDate, endDate, interval = 'hourly' } = req.query;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Login required' });
  }

  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'ValidationError', message: 'deviceId is required' });
  }

  // Verify device belongs to user
  const deviceCheck = await db.query(
    `SELECT device_id FROM devices WHERE device_id = $1 AND user_id = $2`,
    [deviceId, userId]
  );

  if (deviceCheck.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'DeviceNotFound', message: 'Device not found or does not belong to you' });
  }

  // Default to today if no dates provided
  const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = endDate ? new Date(endDate) : new Date();

  try {
    const readings = await iotService.getDeviceProduction(deviceId, start, end, interval);
    
    // Handle empty or invalid readings
    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      return res.json({
        success: true,
        data: {
          device_id: deviceId,
          readings: [],
          summary: {
            total_energy_kwh: 0,
            avg_power_kw: 0,
            max_power_kw: 0,
            reading_count: 0,
          },
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
            interval,
          },
        },
      });
    }
    
    const totalGeneration = parseFloat(readings.reduce((sum, r) => sum + (parseFloat(r.total_energy) || 0), 0).toFixed(4));
    const avgPower = readings.length > 0 ? parseFloat((readings.reduce((sum, r) => sum + (parseFloat(r.avg_power) || 0), 0) / readings.length).toFixed(4)) : 0;
    const maxPower = readings.length > 0 ? parseFloat(Math.max(...readings.map(r => parseFloat(r.max_power) || 0)).toFixed(4)) : 0;

    // For small values, convert to Wh and W for better readability
    const isSmallScale = maxPower < 0.1; // Less than 100W
    
    res.json({
      success: true,
      data: {
        device_id: deviceId,
        readings: readings,
        summary: {
          total_energy_kwh: totalGeneration,
          total_energy_wh: isSmallScale ? totalGeneration * 1000 : null, // Show Wh if small
          avg_power_kw: avgPower,
          avg_power_w: isSmallScale ? avgPower * 1000 : null, // Show W if small
          max_power_kw: maxPower,
          max_power_w: isSmallScale ? maxPower * 1000 : null, // Show W if small
          reading_count: readings.length,
          scale: isSmallScale ? 'watts' : 'kilowatts',
        },
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          interval,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting device production:', error);
    res.status(500).json({ success: false, error: 'InternalServerError', message: error.message });
  }
});

// Get combined production (all devices for user)
const getCombinedProduction = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { startDate, endDate, interval = 'hourly' } = req.query;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Login required' });
  }

  // Default to today if no dates provided
  const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = endDate ? new Date(endDate) : new Date();

  try {
    const readings = await iotService.getCombinedProduction(userId, start, end, interval);
    
    // Handle empty or invalid readings
    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      const devicesResult = await db.query(
        `SELECT device_id, device_name FROM devices WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      
      return res.json({
        success: true,
        data: {
          user_id: userId,
          device_count: devicesResult.rows.length,
          devices: devicesResult.rows,
          readings: [],
          summary: {
            total_energy_kwh: 0,
            avg_power_kw: 0,
            max_power_kw: 0,
            reading_count: 0,
          },
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
            interval,
          },
        },
      });
    }
    
    const totalGeneration = parseFloat(readings.reduce((sum, r) => sum + (parseFloat(r.total_energy) || 0), 0).toFixed(2));
    const avgPower = readings.length > 0 ? parseFloat((readings.reduce((sum, r) => sum + (parseFloat(r.avg_power) || 0), 0) / readings.length).toFixed(2)) : 0;
    const maxPower = readings.length > 0 ? parseFloat(Math.max(...readings.map(r => parseFloat(r.max_power) || 0)).toFixed(2)) : 0;

    // Get list of devices for this user
    const devicesResult = await db.query(
      `SELECT device_id, device_name FROM devices WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    // For small values, convert to Wh and W for better readability
    const isSmallScale = maxPower < 0.1; // Less than 100W

    res.json({
      success: true,
      data: {
        user_id: userId,
        device_count: devicesResult.rows.length,
        devices: devicesResult.rows,
        readings: readings,
        summary: {
          total_energy_kwh: totalGeneration,
          total_energy_wh: isSmallScale ? totalGeneration * 1000 : null,
          avg_power_kw: avgPower,
          avg_power_w: isSmallScale ? avgPower * 1000 : null,
          max_power_kw: maxPower,
          max_power_w: isSmallScale ? maxPower * 1000 : null,
          reading_count: readings.length,
          scale: isSmallScale ? 'watts' : 'kilowatts',
        },
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          interval,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting combined production:', error);
    res.status(500).json({ success: false, error: 'InternalServerError', message: error.message });
  }
});

module.exports = {
  ingestData,
  getLatestReading,
  getDeviceLatestReading,
  getReadingHistory,
  getDeviceProduction,
  getCombinedProduction,
  registerDevice,
  getDevices,
  getDevice,
  updateDevice,
  deleteDevice,
  sendCommand,
};
