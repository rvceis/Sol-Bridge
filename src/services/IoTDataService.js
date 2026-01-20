const mqtt = require('mqtt');
const db = require('../database');
const { cacheSet, cacheGet } = require('../utils/cache');
const logger = require('../utils/logger');
const config = require('../config');

class IoTDataService {
  constructor() {
    this.mqttClient = null;
    this.isConnected = false;
  }

  // Initialize MQTT connection
  async initialize() {
    // Skip MQTT initialization if disabled
    if (!config.mqtt.enabled) {
      logger.info('MQTT is disabled, skipping initialization');
      return false;
    }

    try {
      this.mqttClient = mqtt.connect(config.mqtt.brokerUrl, {
        username: config.mqtt.username,
        password: config.mqtt.password,
        qos: config.mqtt.qos,
        reconnectPeriod: config.mqtt.reconnectPeriod,
        clean: true,
        connectTimeout: 5000,
      });

      this.mqttClient.on('connect', () => {
        logger.info('MQTT connected');
        this.isConnected = true;
        // Subscribe to all energy topics
        this.mqttClient.subscribe(`${config.mqtt.topicPrefix}#`, { qos: 1 });
      });

      this.mqttClient.on('disconnect', () => {
        logger.warn('MQTT disconnected');
        this.isConnected = false;
      });

      this.mqttClient.on('error', (err) => {
        logger.error('MQTT error:', err.message);
      });

      // Message handler
      this.mqttClient.on('message', (topic, payload) => {
        this.handleMessage(topic, payload).catch((err) => {
          logger.error('Error handling MQTT message:', err);
        });
      });

      // Wait for connection with timeout
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MQTT connection timeout'));
        }, 5000);
        
        this.mqttClient.once('connect', () => {
          clearTimeout(timeout);
          resolve(true);
        });
        
        this.mqttClient.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (error) {
      logger.error('MQTT initialization failed:', error);
      throw error;
    }
  }

  // Handle incoming MQTT message
  async handleMessage(topic, payload) {
    try {
      // Parse topic: energy/location/user_id/device_type/measurement_type
      const topicParts = topic.split('/');
      if (topicParts.length < 3) {
        logger.warn('Invalid topic format:', topic);
        return;
      }

      const userId = topicParts[2];
      const measurementType = topicParts[4] || 'generation';

      // Parse payload
      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch (err) {
        logger.error('Invalid JSON payload:', payload.toString());
        return;
      }

      // Validate message
      const validationResult = await this.validateMessage(data, userId);
      if (!validationResult.valid) {
        logger.error('Message validation failed:', validationResult.error);
        logger.error('Failed data:', JSON.stringify(data, null, 2));
        await this.handleInvalidData(topic, data, validationResult.error);
        return;
      }

      logger.info('✅ Validation passed, enriching data...');
      
      // Enrich data
      const enrichedData = await this.enrichData(data, userId, measurementType);

      logger.info('✅ Data enriched, storing...');
      
      // Store data
      await this.storeData(enrichedData, userId, measurementType);
      
      logger.info('✅ Data stored successfully');


      // Publish event
      await this.publishEvent('new_energy_data', enrichedData);

      // Check for anomalies
      if (config.features.enableAnomalyDetection) {
        await this.checkAnomalies(enrichedData, userId);
      }
    } catch (error) {
      logger.error('Error in handleMessage:', error);
    }
  }

  // Validate message schema and content
  async validateMessage(data, userId) {
    try {
      logger.info(`Validating message for device ${data.device_id}, user ${userId}`);
      
      // Required fields
      if (!data.device_id || !data.timestamp || !data.measurements) {
        logger.error(`Missing required fields - device_id: ${!!data.device_id}, timestamp: ${!!data.timestamp}, measurements: ${!!data.measurements}`);
        return {
          valid: false,
          error: 'Missing required fields (device_id, timestamp, measurements)',
        };
      }

      // Validate timestamp
      const timestamp = new Date(data.timestamp);
      let useServerTime = false;
      
      // If timestamp is invalid or too old (before 2020), use server time
      if (isNaN(timestamp.getTime()) || timestamp.getFullYear() < 2020) {
        useServerTime = true;
        logger.warn(`Invalid or old timestamp from device ${data.device_id}, using server time`);
      }

      // Check for future timestamp (allow 5 min drift)
      if (!useServerTime && timestamp > new Date(Date.now() + 5 * 60 * 1000)) {
        logger.warn(`Future timestamp from device ${data.device_id}, using server time`);
        useServerTime = true;
      }

      // Use server time if needed
      if (useServerTime) {
        data.timestamp = new Date().toISOString();
      }

      // Verify device exists and belongs to user
      let deviceResult;
      try {
        deviceResult = await db.query(
          'SELECT * FROM devices WHERE device_id = $1 AND user_id = $2',
          [data.device_id, userId]
        );
      } catch (dbError) {
        logger.error(`Database query error for device ${data.device_id}:`, dbError);
        return {
          valid: false,
          error: `Database error: ${dbError.message}`,
        };
      }

      if (deviceResult.rows.length === 0) {
        logger.error(`Device ${data.device_id} not found for user ${userId}`);
        return {
          valid: false,
          error: 'Device not found or does not belong to user',
        };
      }

      const device = deviceResult.rows[0];
      if (device.status === 'decommissioned') {
        logger.warn(`Device ${data.device_id} is decommissioned`);
        return {
          valid: false,
          error: 'Device is decommissioned',
        };
      }

      // Skip range validation - accept all sensor readings
      logger.info(`✅ Validation passed for device ${data.device_id} - accepting all measurements`);
      return { valid: true };
    } catch (error) {
      logger.error('Validation error:', error);
      logger.error('Error stack:', error.stack);
      return {
        valid: false,
        error: `Validation exception: ${error.message}`,
      };
    }
  }

  // Enrich data with additional information
  async enrichData(data, userId, measurementType) {
    try {
      // Fetch user metadata
      const userResult = await db.query(
        `SELECT u.full_name, h.solar_capacity_kw, h.location, h.panel_efficiency
         FROM users u
         LEFT JOIN hosts h ON u.id = h.user_id
         WHERE u.id = $1`,
        [userId]
      );

      const user = userResult.rows[0];

      // Calculate efficiency if solar generation
      let efficiency = null;
      if (measurementType === 'solar' && data.measurements.power_kw && user?.panel_efficiency) {
        // Simple efficiency calculation (would need irradiance data for accurate)
        efficiency = (data.measurements.power_kw / (user.solar_capacity_kw || 5)) * 100;
      }

      return {
        ...data,
        user_id: userId,
        measurement_type: measurementType,
        processing_timestamp: new Date().toISOString(),
        efficiency: efficiency,
        user_name: user?.full_name,
        solar_capacity: user?.solar_capacity_kw,
      };
    } catch (error) {
      logger.error('Error enriching data:', error);
      return { ...data, user_id: userId, measurement_type: measurementType };
    }
  }

  // Store data in multiple layers
  async storeData(data, userId, measurementType) {
    try {
      const { device_id, timestamp, measurements } = data;

      // Hot path: Redis (latest reading)
      const redisKey = `iot:latest:${userId}`;
      await cacheSet(redisKey, {
        device_id,
        timestamp,
        ...measurements,
        measurement_type: measurementType,
      }, 3600); // 1 hour TTL

      // Warm path: PostgreSQL recent_readings (last 48 hours)
      // TODO: Create recent_readings table if not exists
      // await db.query(
      //   `INSERT INTO recent_readings (device_id, user_id, timestamp, measurements)
      //    VALUES ($1, $2, $3, $4)`,
      //   [device_id, userId, timestamp, JSON.stringify(measurements)]
      // );

      // Cold path: TimescaleDB (long-term storage)
      await db.query(
        `INSERT INTO energy_readings 
         (time, device_id, user_id, measurement_type, power_kw, energy_kwh, voltage, current, 
          frequency, power_factor, battery_soc, battery_voltage, battery_current, temperature, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          timestamp,
          device_id,
          userId,
          measurementType,
          measurements.power_kw || null,
          measurements.energy_kwh || null,
          measurements.voltage || null,
          measurements.current || null,
          measurements.frequency || null,
          measurements.power_factor || null,
          measurements.battery_soc || null,
          measurements.battery_voltage || null,
          measurements.battery_current || null,
          measurements.temperature || null,
          JSON.stringify(data.device_status || {}),
        ]
      );

      // Update device last_seen_at
      await db.query(
        `UPDATE devices SET last_seen_at = NOW(), last_reading = $1, status = 'active'
         WHERE device_id = $2`,
        [JSON.stringify(measurements), device_id]
      );
    } catch (error) {
      logger.error('Error storing data:', error);
      // Store in DLQ for retry
      await this.storeInDLQ(data, error);
      throw error;
    }
  }

  // Check for anomalies
  async checkAnomalies(data, userId) {
    try {
      const { device_id, measurement_type, measurements } = data;

      // Get historical average for same hour of day
      const hour = new Date(data.processing_timestamp).getHours();
      const dayOfWeek = new Date(data.processing_timestamp).getDay();

      // Simple anomaly check: if power drops > 50% from average
      if (measurement_type === 'solar' && measurements.power_kw !== undefined) {
        // Query last 30 days for same hour/day
        const avgResult = await db.query(
          `SELECT AVG(power_kw) as avg_power 
           FROM energy_readings 
           WHERE device_id = $1 
           AND EXTRACT(HOUR FROM time) = $2 
           AND EXTRACT(DOW FROM time) = $3
           AND time > NOW() - INTERVAL '30 days'`,
          [device_id, hour, dayOfWeek]
        );

        const avgPower = avgResult.rows[0]?.avg_power;
        if (avgPower && measurements.power_kw < avgPower * 0.5) {
          logger.warn(`Anomaly detected for device ${device_id}: Low generation`, {
            current: measurements.power_kw,
            average: avgPower,
          });

          // TODO: Send alert notification to user
        }
      }
    } catch (error) {
      logger.error('Error in anomaly detection:', error);
    }
  }

  // Handle invalid data
  async handleInvalidData(topic, data, error) {
    try {
      await db.query(
        `INSERT INTO invalid_data_log (topic, payload, error, received_at)
         VALUES ($1, $2, $3, NOW())`,
        [topic, JSON.stringify(data), error]
      );
    } catch (err) {
      logger.error('Error logging invalid data:', err);
    }
  }

  // Store in Dead Letter Queue
  async storeInDLQ(data, error) {
    try {
      logger.error('Storing message in DLQ:', {
        device_id: data.device_id,
        error: error.message,
      });

      // TODO: Store in DLQ for processing later
    } catch (err) {
      logger.error('Error storing in DLQ:', err);
    }
  }

  // Publish event for subscribers
  async publishEvent(eventType, data) {
    try {
      const { redis } = require('../utils/cache');
      const channel = `events:${eventType}:${data.user_id}`;
      await redis.publish(channel, JSON.stringify(data));
    } catch (error) {
      logger.error('Error publishing event:', error);
    }
  }

  // Get latest reading for user
  async getLatestReading(userId) {
    try {
      const reading = await cacheGet(`iot:latest:${userId}`);
      if (reading) {
        return reading;
      }

      // Fallback to database
      const result = await db.query(
        `SELECT * FROM energy_readings 
         WHERE user_id = $1 
         ORDER BY time DESC 
         LIMIT 1`,
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting latest reading:', error);
      return null;
    }
  }

  // Get reading history
  async getReadingHistory(userId, startDate, endDate, resolution = 'hourly') {
    try {
      let query = `
        SELECT 
          time,
          AVG(power_kw) as avg_power,
          MAX(power_kw) as max_power,
          MIN(power_kw) as min_power,
          SUM(energy_kwh) as total_energy
        FROM energy_readings
        WHERE user_id = $1 AND time BETWEEN $2 AND $3
      `;

      const params = [userId, startDate, endDate];

      // Group by resolution
      if (resolution === 'hourly') {
        query += `
          GROUP BY time_bucket('1 hour', time)
          ORDER BY time DESC
        `;
      } else if (resolution === 'daily') {
        query += `
          GROUP BY time_bucket('1 day', time)
          ORDER BY time DESC
        `;
      }

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting reading history:', error);
      return [];
    }
  }

  // Send command to device
  async sendCommand(userId, deviceId, command, value) {
    try {
      if (!this.isConnected) {
        throw new Error('MQTT not connected');
      }

      const topic = `${config.mqtt.topicPrefix}${userId}/${deviceId}/commands`;
      const payload = JSON.stringify({
        command,
        value,
        timestamp: new Date().toISOString(),
      });

      this.mqttClient.publish(topic, payload, { qos: 1 });
      logger.info(`Command sent to device ${deviceId}:`, { command, value });
    } catch (error) {
      logger.error('Error sending command:', error);
      throw error;
    }
  }

  // Device Management Methods

  async registerDevice({ userId, deviceType, deviceModel, firmwareVersion }) {
    try {
      const deviceId = `${deviceType}-${userId.slice(0, 8)}-${Date.now()}`;
      const query = `
        INSERT INTO devices (device_id, user_id, device_type, device_model, firmware_version, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const result = await db.query(query, [
        deviceId,
        userId,
        deviceType,
        deviceModel || null,
        firmwareVersion || null,
        'active'
      ]);

      logger.info('Device registered:', { deviceId, userId, deviceType });
      return result.rows[0];
    } catch (error) {
      logger.error('Error registering device:', error);
      throw error;
    }
  }

  async getUserDevices(userId) {
    try {
      const query = `
        SELECT device_id, user_id, device_type, device_model, firmware_version, status, 
               last_seen_at, installation_date, created_at, updated_at,
               last_reading
        FROM devices
        WHERE user_id = $1
        ORDER BY created_at DESC
      `;
      const result = await db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching user devices:', error);
      throw error;
    }
  }

  async getDeviceById(deviceId, userId) {
    try {
      const query = `
        SELECT device_id, user_id, device_type, device_model, firmware_version, status, 
               last_seen_at, installation_date, created_at, updated_at,
               last_reading
        FROM devices
        WHERE device_id = $1 AND user_id = $2
      `;
      const result = await db.query(query, [deviceId, userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching device:', error);
      throw error;
    }
  }

  async getDeviceByIdOnly(deviceId) {
    try {
      const query = `
        SELECT device_id, user_id, device_type, device_model, firmware_version, status, 
               last_seen_at, installation_date, created_at, updated_at,
               last_reading
        FROM devices
        WHERE device_id = $1
      `;
      const result = await db.query(query, [deviceId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching device:', error);
      throw error;
    }
  }

  async updateDevice(deviceId, userId, { deviceModel, status, configuration }) {
    try {
      const updates = [];
      const values = [deviceId, userId];
      let paramCount = 3;

      if (deviceModel !== undefined) {
        updates.push(`device_model = $${paramCount++}`);
        values.push(deviceModel);
      }
      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }
      if (configuration !== undefined) {
        updates.push(`configuration = $${paramCount++}`);
        values.push(JSON.stringify(configuration));
      }

      updates.push(`updated_at = NOW()`);

      const query = `
        UPDATE devices
        SET ${updates.join(', ')}
        WHERE device_id = $1 AND user_id = $2
        RETURNING *
      `;

      const result = await db.query(query, values);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error updating device:', error);
      throw error;
    }
  }

  async deleteDevice(deviceId, userId) {
    try {
      const query = `
        DELETE FROM devices
        WHERE device_id = $1 AND user_id = $2
        RETURNING device_id
      `;
      const result = await db.query(query, [deviceId, userId]);
      logger.info('Device deleted:', { deviceId, userId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting device:', error);
      throw error;
    }
  }

  // Close MQTT connection
  async close() {
    return new Promise((resolve) => {
      if (this.mqttClient) {
        this.mqttClient.end(resolve);
      } else {
        resolve();
      }
    });
  }

  // Get device production data (single device)
  async getDeviceProduction(deviceId, startDate, endDate, resolution = 'hourly') {
    try {
      // Convert resolution format: hourly->hour, daily->day, weekly->week
      const intervalMap = {
        hourly: 'hour',
        daily: 'day',
        weekly: 'week'
      };
      const interval = intervalMap[resolution] || 'hour';
      
      let query = `
        SELECT 
          time_bucket('1 ${interval}', time) as time,
          AVG(power_kw)::FLOAT as avg_power,
          MAX(power_kw)::FLOAT as max_power,
          MIN(power_kw)::FLOAT as min_power,
          SUM(energy_kwh)::FLOAT as total_energy,
          AVG(temperature)::FLOAT as avg_temperature
        FROM energy_readings
        WHERE device_id = $1 AND time BETWEEN $2 AND $3
        GROUP BY time_bucket('1 ${interval}', time)
        ORDER BY time DESC
      `;

      const result = await db.query(query, [deviceId, startDate, endDate]);
      
      // Ensure all numeric values are properly formatted
      const rows = (result.rows || []).map(row => ({
        time: row.time,
        avg_power: parseFloat(row.avg_power) || 0,
        max_power: parseFloat(row.max_power) || 0,
        min_power: parseFloat(row.min_power) || 0,
        total_energy: parseFloat(row.total_energy) || 0,
        avg_temperature: parseFloat(row.avg_temperature) || null,
      }));
      
      return rows;
    } catch (error) {
      logger.error('Error getting device production:', error);
      throw error;
    }
  }

  // Get combined production data (all devices for user)
  async getCombinedProduction(userId, startDate, endDate, resolution = 'hourly') {
    try {
      // Convert resolution format: hourly->hour, daily->day, weekly->week
      const intervalMap = {
        hourly: 'hour',
        daily: 'day',
        weekly: 'week'
      };
      const interval = intervalMap[resolution] || 'hour';
      
      let query = `
        SELECT 
          time_bucket('1 ${interval}', time) as time,
          AVG(power_kw)::FLOAT as avg_power,
          MAX(power_kw)::FLOAT as max_power,
          MIN(power_kw)::FLOAT as min_power,
          SUM(energy_kwh)::FLOAT as total_energy,
          AVG(temperature)::FLOAT as avg_temperature
        FROM energy_readings
        WHERE user_id = $1 AND time BETWEEN $2 AND $3
        GROUP BY time_bucket('1 ${interval}', time)
        ORDER BY time DESC
      `;

      const result = await db.query(query, [userId, startDate, endDate]);
      
      // Ensure all numeric values are properly formatted
      const rows = (result.rows || []).map(row => ({
        time: row.time,
        avg_power: parseFloat(row.avg_power) || 0,
        max_power: parseFloat(row.max_power) || 0,
        min_power: parseFloat(row.min_power) || 0,
        total_energy: parseFloat(row.total_energy) || 0,
        avg_temperature: parseFloat(row.avg_temperature) || null,
      }));
      
      return rows;
      return result.rows || [];
    } catch (error) {
      logger.error('Error getting combined production:', error);
      throw error;
    }
  }
}

module.exports = new IoTDataService();
