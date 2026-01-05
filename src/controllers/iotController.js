const iotService = require('../services/IoTDataService');
const { asyncHandler } = require('../utils/errors');
const { schemas, validate } = require('../utils/validation');

// Ingest IoT data
const ingestData = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.iotData);
  await iotService.handleMessage(
    `energy/${data.user_id}/device/reading`,
    Buffer.from(JSON.stringify(data))
  );

  res.json({
    status: 'accepted',
    timestamp: new Date().toISOString(),
  });
});

// Get latest reading - uses authenticated user's ID
const getLatestReading = asyncHandler(async (req, res) => {
  const userId = req.user.id; // Get from authenticated user
  const reading = await iotService.getLatestReading(userId);

  if (!reading) {
    return res.json({
      success: true,
      data: {
        reading: null,
        device: null,
        lastUpdated: new Date().toISOString(),
        message: 'No readings found. Connect a solar device to start tracking.',
      },
    });
  }

  res.json({
    success: true,
    data: {
      reading,
      device: reading.device || null,
      lastUpdated: reading.timestamp || new Date().toISOString(),
    },
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
  // TODO: Implement device registration
  res.json({
    message: 'Device registration endpoint',
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
  sendCommand,
};
