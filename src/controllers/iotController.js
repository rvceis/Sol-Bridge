const iotService = require('../services/IoTDataService');
const { asyncHandler } = require('../utils/errors');
const { schemas, validate } = require('../utils/validation');
const { cacheGet, cacheSet, cacheDel } = require('../utils/cache');

// Ingest IoT data
const ingestData = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.iotData);
  await iotService.handleMessage(
    `energy/${data.user_id}/device/reading`,
    Buffer.from(JSON.stringify(data))
  );
  
  // Invalidate user's reading cache when new data arrives
  await cacheDel(`iot:latest:${data.user_id}`);

  res.json({
    status: 'accepted',
    timestamp: new Date().toISOString(),
  });
});

// Get latest reading - uses authenticated user's ID (with Redis caching)
const getLatestReading = asyncHandler(async (req, res) => {
  const userId = req.user.id;
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
  const userId = req.user.id; // Get from authenticated user
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

module.exports = {
  ingestData,
  getLatestReading,
  getReadingHistory,
  registerDevice,
  getDevices,
  getDevice,
  updateDevice,
  deleteDevice,
  sendCommand,
};
