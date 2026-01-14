const DeviceService = require('../services/DeviceService');
const logger = require('../utils/logger');

class DeviceController {
  // Get user's devices
  async getMyDevices(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const devices = await DeviceService.getUserDevices(userId);
      res.json({ success: true, data: devices });
    } catch (error) {
      logger.error('Error in getMyDevices:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch devices' });
    }
  }

  // Get all devices
  async getAllDevices(req, res) {
    try {
      const devices = await DeviceService.getAllDevices();
      res.json({ success: true, data: devices });
    } catch (error) {
      logger.error('Error in getAllDevices:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch devices' });
    }
  }

  // Get device by ID
  async getDeviceById(req, res) {
    try {
      const { deviceId } = req.params;
      if (!deviceId) {
        return res.status(400).json({ success: false, error: 'Device ID required' });
      }

      const device = await DeviceService.getDeviceById(deviceId);
      if (!device) {
        return res.status(404).json({ success: false, error: 'Device not found' });
      }

      res.json({ success: true, data: device });
    } catch (error) {
      logger.error('Error in getDeviceById:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch device' });
    }
  }

  // Create device
  async createDevice(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const deviceData = req.body;
      const device = await DeviceService.createDevice(userId, deviceData);
      res.status(201).json({ success: true, data: device });
    } catch (error) {
      logger.error('Error in createDevice:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create device' });
    }
  }

  // Update device
  async updateDevice(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { deviceId } = req.params;
      const updates = req.body;

      // Verify user owns the device
      const device = await DeviceService.getDeviceById(deviceId);
      if (!device || device.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Not authorized to update this device' });
      }

      const updated = await DeviceService.updateDevice(deviceId, updates);
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error in updateDevice:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update device' });
    }
  }

  // Delete device
  async deleteDevice(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { deviceId } = req.params;

      // Verify user owns the device
      const device = await DeviceService.getDeviceById(deviceId);
      if (!device || device.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Not authorized to delete this device' });
      }

      await DeviceService.deleteDevice(deviceId);
      res.json({ success: true, message: 'Device deleted successfully' });
    } catch (error) {
      logger.error('Error in deleteDevice:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to delete device' });
    }
  }
}

module.exports = new DeviceController();
