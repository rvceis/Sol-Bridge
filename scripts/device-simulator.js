#!/usr/bin/env node
/**
 * IoT Device Simulator for Testing
 * Simulates solar panel sending data via MQTT
 */

const mqtt = require('mqtt');

// Configuration
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const DEVICE_ID = process.env.DEVICE_ID || `test_device_${Date.now()}`;
const PUBLISH_INTERVAL = parseInt(process.env.PUBLISH_INTERVAL || '10000'); // 10 seconds

console.log('='.repeat(60));
console.log('Solar Device Simulator');
console.log('='.repeat(60));
console.log(`Device ID: ${DEVICE_ID}`);
console.log(`MQTT Broker: ${MQTT_URL}`);
console.log(`Publish Interval: ${PUBLISH_INTERVAL}ms`);
console.log('='.repeat(60));

// Connect to MQTT broker
const client = mqtt.connect(MQTT_URL, {
  clientId: `simulator_${DEVICE_ID}`,
  clean: true,
  reconnectPeriod: 5000,
});

// Topics
const dataTopic = `solar/${DEVICE_ID}/data`;
const statusTopic = `solar/${DEVICE_ID}/status`;
const commandTopic = `solar/${DEVICE_ID}/command`;
const forecastTopic = `solar/${DEVICE_ID}/forecast`;

// Simulate solar generation based on time of day
function simulateSolarPower() {
  const hour = new Date().getHours();
  
  // Solar power varies with sun position
  let basePower = 0;
  
  if (hour >= 6 && hour < 8) {
    // Morning ramp-up
    basePower = 1.0 + (hour - 6) * 1.5;
  } else if (hour >= 8 && hour < 12) {
    // Morning peak
    basePower = 3.5 + (hour - 8) * 0.5;
  } else if (hour >= 12 && hour < 14) {
    // Afternoon peak
    basePower = 5.0;
  } else if (hour >= 14 && hour < 18) {
    // Afternoon decline
    basePower = 5.0 - (hour - 14) * 0.8;
  } else if (hour >= 18 && hour < 20) {
    // Evening
    basePower = 1.8 - (hour - 18) * 0.9;
  }
  
  // Add some random variation (clouds, etc.)
  const variation = (Math.random() - 0.5) * 0.5;
  return Math.max(0, basePower + variation);
}

// Generate realistic sensor data
function generateSensorData() {
  const power_kw = simulateSolarPower();
  const voltage = 230 + (Math.random() - 0.5) * 10; // 225-235V
  const current = power_kw * 1000 / voltage; // I = P/V
  const temperature = 25 + (Math.random() * 20); // 25-45°C
  const frequency = 50 + (Math.random() - 0.5) * 0.2; // ~50Hz
  const power_factor = 0.95 + (Math.random() * 0.05); // 0.95-1.0
  
  return {
    timestamp: new Date().toISOString(),
    power_kw: parseFloat(power_kw.toFixed(2)),
    voltage: parseFloat(voltage.toFixed(1)),
    current: parseFloat(current.toFixed(2)),
    frequency: parseFloat(frequency.toFixed(2)),
    temperature: parseFloat(temperature.toFixed(1)),
    power_factor: parseFloat(power_factor.toFixed(2)),
    energy_kwh: parseFloat((power_kw * 0.0028).toFixed(3)), // Cumulative over 10s
  };
}

// MQTT event handlers
client.on('connect', () => {
  console.log('\n✓ Connected to MQTT broker');
  
  // Subscribe to command and forecast topics
  client.subscribe(commandTopic, (err) => {
    if (!err) {
      console.log(`✓ Subscribed to commands: ${commandTopic}`);
    }
  });
  
  client.subscribe(forecastTopic, (err) => {
    if (!err) {
      console.log(`✓ Subscribed to forecasts: ${forecastTopic}`);
    }
  });
  
  // Send initial status
  publishStatus('online');
  
  // Start publishing data
  console.log('\n📡 Starting to publish sensor data...\n');
  publishData();
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
});

client.on('disconnect', () => {
  console.log('⚠️  Disconnected from MQTT broker');
});

client.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    
    if (topic === commandTopic) {
      console.log(`\n📩 Received command: ${data.command}`);
      handleCommand(data.command);
    } else if (topic === forecastTopic) {
      console.log(`\n🔮 Received forecast:`);
      console.log(`   Next 6 hours: ${data.predictions.slice(0, 6).map(p => p.toFixed(2)).join(', ')} kW`);
    }
  } catch (err) {
    console.error('Error processing message:', err.message);
  }
});

// Publish sensor data
function publishData() {
  const data = generateSensorData();
  
  client.publish(dataTopic, JSON.stringify(data), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Publish error:', err.message);
    } else {
      const timeStr = new Date().toLocaleTimeString();
      console.log(`[${timeStr}] 📊 Power: ${data.power_kw} kW | Voltage: ${data.voltage}V | Temp: ${data.temperature}°C`);
    }
  });
  
  // Schedule next publish
  setTimeout(publishData, PUBLISH_INTERVAL);
}

// Publish device status
function publishStatus(status) {
  const statusData = {
    status: status,
    signal_strength: 85 + Math.floor(Math.random() * 10), // 85-95%
    error_code: null,
    uptime: process.uptime(),
  };
  
  client.publish(statusTopic, JSON.stringify(statusData), { qos: 1 }, (err) => {
    if (!err) {
      console.log(`✓ Status published: ${status}`);
    }
  });
}

// Handle commands from backend
function handleCommand(command) {
  switch (command) {
    case 'restart':
      console.log('🔄 Restarting device...');
      publishStatus('restarting');
      setTimeout(() => {
        publishStatus('online');
        console.log('✓ Device restarted');
      }, 3000);
      break;
      
    case 'status':
      publishStatus('online');
      break;
      
    case 'stop':
      console.log('🛑 Stopping device...');
      publishStatus('offline');
      client.end();
      process.exit(0);
      break;
      
    default:
      console.log(`⚠️  Unknown command: ${command}`);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down...');
  publishStatus('offline');
  setTimeout(() => {
    client.end();
    process.exit(0);
  }, 500);
});

// Keep alive - publish status every 60 seconds
setInterval(() => {
  publishStatus('online');
}, 60000);
