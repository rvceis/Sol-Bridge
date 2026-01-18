/**
 * IoT Device Management & MQTT Handler
 * Manages device registration, data ingestion, and ML predictions
 */

const mqtt = require('mqtt');
const axios = require('axios');
const logger = require('../utils/logger');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';

class IoTManager {
  constructor() {
    this.mqttClient = null;
    this.devices = new Map();  // In-memory device cache
    this.dataBuffer = [];
    this.bufferSize = 100;
  }

  /**
   * Initialize MQTT connection
   */
  async initMQTT() {
    return new Promise((resolve, reject) => {
      logger.debug(`Connecting to MQTT: ${MQTT_URL}`);
      
      this.mqttClient = mqtt.connect(MQTT_URL, {
        clientId: `solar-backend-${Date.now()}`,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
      });

      this.mqttClient.on('connect', () => {
        logger.debug('✓ MQTT Connected');
        
        // Subscribe to device topics
        this.mqttClient.subscribe('solar/+/data', (err) => {
          if (err) logger.debug('Subscribe error:', err);
          else logger.debug('✓ Subscribed to solar/+/data');
        });

        this.mqttClient.subscribe('solar/+/status', (err) => {
          if (err) logger.debug('Subscribe error:', err);
          else logger.debug('✓ Subscribed to solar/+/status');
        });

        resolve();
      });

      this.mqttClient.on('error', (err) => {
        logger.debug('MQTT error:', err);
        reject(err);
      });

      this.mqttClient.on('message', (topic, message) => {
        this.handleMQTTMessage(topic, message);
      });

      this.mqttClient.on('disconnect', () => {
        logger.debug('⚠ MQTT Disconnected');
      });
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  async handleMQTTMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      const [, deviceId, type] = topic.split('/');

      if (type === 'data') {
        await this.processDeviceData(deviceId, data);
      } else if (type === 'status') {
        this.updateDeviceStatus(deviceId, data);
      }
    } catch (err) {
      logger.error(`MQTT message error (${topic}):`, err.message);
    }
  }

  /**
   * Process incoming sensor data
   */
  async processDeviceData(deviceId, data) {
    try {
      logger.info(`[${deviceId}] Received data:`, {
        power_kw: data.power_kw,
        voltage: data.voltage,
        current: data.current,
        temperature: data.temperature,
      });

      // Validate data
      if (!this.validateSensorData(data)) {
        logger.warn(`[${deviceId}] Invalid sensor data`);
        return;
      }

      // Store in buffer
      this.dataBuffer.push({
        device_id: deviceId,
        timestamp: new Date(data.timestamp || Date.now()),
        ...data,
      });

      // Trigger ML prediction if buffer full
      if (this.dataBuffer.length >= this.bufferSize) {
        await this.processPredictionBatch();
      }

      // Update device last_seen
      if (this.devices.has(deviceId)) {
        const device = this.devices.get(deviceId);
        device.last_seen = new Date();
        device.last_reading = data;
      }
    } catch (err) {
      logger.error(`[${deviceId}] Data processing error:`, err.message);
    }
  }

  /**
   * Validate sensor data ranges
   */
  validateSensorData(data) {
    if (!data || typeof data !== 'object') return false;
    
    // Check required fields
    if (data.power_kw === undefined || data.voltage === undefined) {
      return false;
    }

    // Validate ranges
    if (data.power_kw < 0 || data.power_kw > 100) return false;  // 0-100 kW
    if (data.voltage < 200 || data.voltage > 260) return false;  // 200-260V
    if (data.current !== undefined && (data.current < 0 || data.current > 500)) return false;  // 0-500A
    if (data.temperature !== undefined && (data.temperature < -20 || data.temperature > 60)) return false;  // -20 to 60°C

    return true;
  }

  /**
   * Process batch predictions with ML service
   */
  async processPredictionBatch() {
    if (this.dataBuffer.length === 0) return;

    try {
      const batch = this.dataBuffer.splice(0, this.bufferSize);
      logger.info(`Processing batch of ${batch.length} readings for ML prediction`);

      // Group by device
      const byDevice = {};
      batch.forEach((reading) => {
        if (!byDevice[reading.device_id]) {
          byDevice[reading.device_id] = [];
        }
        byDevice[reading.device_id].push(reading);
      });

      // Call ML service for each device
      for (const [deviceId, readings] of Object.entries(byDevice)) {
        await this.predictForDevice(deviceId, readings);
      }
    } catch (err) {
      logger.error('Batch prediction error:', err.message);
    }
  }

  /**
   * Get predictions from ML service
   */
  async predictForDevice(deviceId, readings) {
    try {
      const device = this.devices.get(deviceId);
      if (!device) return;

      // Prepare data for ML service
      const historicalData = readings.map((r) => ({
        timestamp: r.timestamp,
        power_kw: r.power_kw,
        voltage: r.voltage,
        current: r.current || 0,
      }));

      const payload = {
        host_id: deviceId,
        panel_capacity_kw: device.capacity_kw || 5.0,
        historical_data: historicalData,
        forecast_hours: 24,
      };

      logger.info(`[${deviceId}] Calling ML service for solar forecast...`);
      const response = await axios.post(
        `${ML_SERVICE_URL}/api/v1/forecast/solar`,
        payload,
        { timeout: 30000 }
      );

      // Store prediction
      device.latest_forecast = {
        timestamp: new Date(),
        predictions: response.data.predictions || [],
        confidence: response.data.confidence_intervals || [],
      };

      logger.info(`[${deviceId}] ✓ Got ${response.data.predictions?.length || 0} hour forecast`);

      // Publish to MQTT
      this.publishForecast(deviceId, device.latest_forecast);
    } catch (err) {
      logger.error(`[${deviceId}] ML prediction error:`, err.message);
    }
  }

  /**
   * Publish forecast back to MQTT
   */
  publishForecast(deviceId, forecast) {
    if (!this.mqttClient) return;

    const topic = `solar/${deviceId}/forecast`;
    const payload = JSON.stringify({
      timestamp: forecast.timestamp,
      predictions: forecast.predictions.slice(0, 6), // Next 6 hours
      confidence: forecast.confidence.slice(0, 6),
    });

    this.mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) logger.error(`[${deviceId}] Publish error:`, err);
      else logger.info(`[${deviceId}] ✓ Published forecast to MQTT`);
    });
  }

  /**
   * Update device status (online/offline/error)
   */
  updateDeviceStatus(deviceId, status) {
    if (this.devices.has(deviceId)) {
      const device = this.devices.get(deviceId);
      device.status = status.status || 'online';
      device.signal_strength = status.signal_strength || 0;
      device.error_code = status.error_code || null;
      logger.info(`[${deviceId}] Status: ${device.status}`);
    }
  }

  /**
   * Register a new IoT device
   */
  registerDevice(deviceData) {
    const device = {
      device_id: deviceData.device_id,
      name: deviceData.name || `Device-${deviceData.device_id}`,
      location_id: deviceData.location_id,
      capacity_kw: deviceData.capacity_kw || 5.0,
      status: 'offline',
      registered_at: new Date(),
      last_seen: null,
      last_reading: null,
      latest_forecast: null,
    };

    this.devices.set(device.device_id, device);
    logger.info(`✓ Registered device: ${device.device_id}`);
    return device;
  }

  /**
   * Get device info
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Get all devices
   */
  getAllDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Get device forecast
   */
  getDeviceForecast(deviceId) {
    const device = this.devices.get(deviceId);
    return device?.latest_forecast || null;
  }

  /**
   * Publish command to device via MQTT
   */
  sendCommand(deviceId, command) {
    if (!this.mqttClient) {
      logger.error('MQTT not connected');
      return false;
    }

    const topic = `solar/${deviceId}/command`;
    const payload = JSON.stringify({ command, timestamp: new Date() });

    this.mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        logger.error(`[${deviceId}] Command send error:`, err);
        return false;
      }
      logger.info(`[${deviceId}] ✓ Command sent: ${command}`);
      return true;
    });
  }

  /**
   * Flush buffer and trigger final predictions
   */
  async flush() {
    if (this.dataBuffer.length > 0) {
      logger.info(`Flushing ${this.dataBuffer.length} readings...`);
      await this.processPredictionBatch();
    }
  }

  /**
   * Disconnect MQTT
   */
  disconnect() {
    if (this.mqttClient) {
      this.mqttClient.end();
      logger.info('MQTT Disconnected');
    }
  }
}

module.exports = new IoTManager();
