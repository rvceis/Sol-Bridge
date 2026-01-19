const db = require('../database');
const logger = require('../utils/logger');

class DeviceService {
  // Ensure devices table has required columns (idempotent)
  async ensureDeviceSchema() {
    try {
      // Drop the old restrictive CHECK constraint on device_type
      try {
        await db.query(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_type_check`);
        logger.info('ensureDeviceSchema: dropped old device_type check constraint');
      } catch (e) {
        // Ignore if constraint doesn't exist
      }

      // Run each ALTER separately to avoid partial failures
      const columns = [
        "ADD COLUMN IF NOT EXISTS device_name VARCHAR(255)",
        "ADD COLUMN IF NOT EXISTS capacity_kwh DECIMAL(10, 2)",
        "ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(5, 2)",
        "ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'",
      ];
      for (const col of columns) {
        try {
          await db.query(`ALTER TABLE devices ${col}`);
        } catch (e) {
          // Ignore errors (column may already exist or table doesn't exist yet)
        }
      }
      logger.info('ensureDeviceSchema: schema check completed');
    } catch (error) {
      logger.warn('ensureDeviceSchema: failed:', error.message);
    }
  }
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
      // Ensure schema columns exist (handles legacy DBs)
      await this.ensureDeviceSchema();

      const {
        device_name,
        device_type,
        capacity_kwh,
        efficiency_rating,
        installation_date,
        metadata = {}
      } = deviceData;

      // Validate and format installation_date
      let formattedDate = null;
      if (installation_date) {
        // Check if it's a valid date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (typeof installation_date === 'string' && dateRegex.test(installation_date.trim())) {
          // Verify it's an actual valid date
          const dateObj = new Date(installation_date);
          if (!isNaN(dateObj.getTime())) {
            formattedDate = installation_date.trim();
          }
        }
      }

      // Generate a unique device_id
      const device_id = `DEV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Log what we're inserting for debugging
      logger.info('Creating device with data:', {
        device_id,
        userId,
        device_name,
        device_type,
        capacity_kwh,
        efficiency_rating,
        formattedDate,
        metadata: JSON.stringify(metadata)
      });

      const result = await db.query(`
        INSERT INTO devices (device_id, user_id, device_name, device_type, capacity_kwh, efficiency_rating, installation_date, metadata, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'active', NOW(), NOW())
        RETURNING *
      `, [device_id, userId, device_name, device_type, capacity_kwh || null, efficiency_rating || null, formattedDate, JSON.stringify(metadata)]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating device:', error.message, error.stack);
      throw error;
    }
  }

  // Update device
  async updateDevice(deviceId, updates) {
    try {
      const allowedFields = ['device_name', 'device_type', 'capacity_kwh', 'efficiency_rating', 'installation_date', 'metadata', 'status'];
      const updateFields = {};

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          if (key === 'metadata') {
            updateFields[key] = JSON.stringify(updates[key]);
          } else if (key === 'installation_date') {
            // Validate and format installation_date
            if (updates[key]) {
              const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
              if (typeof updates[key] === 'string' && dateRegex.test(updates[key].trim())) {
                const dateObj = new Date(updates[key]);
                if (!isNaN(dateObj.getTime())) {
                  updateFields[key] = updates[key].trim();
                }
              }
            } else {
              updateFields[key] = null;
            }
          } else {
            updateFields[key] = updates[key];
          }
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
