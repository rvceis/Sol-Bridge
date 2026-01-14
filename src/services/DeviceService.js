const db = require('../database');
const logger = require('../utils/logger');

class DeviceService {
  // Get user's devices
  async getUserDevices(userId) {
    try {
      const result = await db.query(
        `SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching user devices:', error);
      throw error;
    }
  }

  // Get all devices
  async getAllDevices() {
    try {
      const result = await db.query(`
        SELECT d.*, u.full_name as owner_name
        FROM devices d
        JOIN users u ON d.user_id = u.id
        ORDER BY d.created_at DESC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching all devices:', error);
      throw error;
    }
  }

  // Get device by ID
  async getDeviceById(deviceId) {
    try {
      const result = await db.query(
        `SELECT * FROM devices WHERE device_id = $1`,
        [deviceId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching device by ID:', error);
      throw error;
    }
  }

  // Create device
  async createDevice(userId, deviceData) {
    try {
      const {
        device_name,
        device_type,
        capacity_kwh,
        efficiency_rating,
        installation_date,
        metadata = {}
      } = deviceData;

      const result = await db.query(`
        INSERT INTO devices (user_id, device_name, device_type, capacity_kwh, efficiency_rating, installation_date, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [userId, device_name, device_type, capacity_kwh, efficiency_rating, installation_date, JSON.stringify(metadata)]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating device:', error);
      throw error;
    }
  }

  // Update device
  async updateDevice(deviceId, updates) {
    try {
      const allowedFields = ['device_name', 'device_type', 'capacity_kwh', 'efficiency_rating', 'installation_date', 'metadata'];
      const updateFields = {};

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          updateFields[key] = updates[key];
        }
      });

      if (Object.keys(updateFields).length === 0) {
        return await this.getDeviceById(deviceId);
      }

      const setClauses = Object.keys(updateFields)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');

      const values = Object.values(updateFields);
      values.push(deviceId);

      const result = await db.query(`
        UPDATE devices
        SET ${setClauses}, updated_at = NOW()
        WHERE device_id = $${values.length}
        RETURNING *
      `, values);

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating device:', error);
      throw error;
    }
  }

  // Delete device
  async deleteDevice(deviceId) {
    try {
      await db.query(`DELETE FROM devices WHERE device_id = $1`, [deviceId]);
      return true;
    } catch (error) {
      logger.error('Error deleting device:', error);
      throw error;
    }
  }
}

module.exports = new DeviceService();
