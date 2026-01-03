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

// Get latest reading
const getLatestReading = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const reading = await iotService.getLatestReading(userId);

  if (!reading) {
    return res.status(404).json({
      error: 'NotFoundError',
      message: 'No readings found',
    });
  }

  res.json(reading);
});

// Get reading history
const getReadingHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const {
    start,
    end,
    resolution = 'hourly',
    limit = 1000,
  } = req.query;

  if (!start || !end) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'start and end query parameters required',
    });
  }

  const readings = await iotService.getReadingHistory(
    userId,
    new Date(start),
    new Date(end),
    resolution
  );

  res.json({
    userId,
    start,
    end,
    resolution,
    data: readings.slice(0, limit),
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
