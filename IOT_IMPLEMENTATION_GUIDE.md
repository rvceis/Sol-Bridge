# IoT Implementation Guide - Solar Sharing Platform

## 📡 Overview

The Solar Sharing Platform integrates IoT devices (ESP32, Arduino, Raspberry Pi) with solar panels to collect real-time energy production data, perform ML-based forecasting, and enable secure peer-to-peer energy trading.

---

## 🏗️ Architecture

```
┌─────────────────┐         MQTT          ┌──────────────────┐
│  IoT Devices    │◄─────────────────────►│  Backend Server  │
│  (ESP32/RPi)    │   mqtt://broker:1883  │  (Node.js)       │
└─────────────────┘                        └──────────────────┘
        │                                            │
        │                                            │ HTTP API
        ▼                                            ▼
┌─────────────────┐                        ┌──────────────────┐
│  Solar Panels   │                        │   ML Service     │
│  (Sensors)      │                        │   (Python)       │
└─────────────────┘                        └──────────────────┘
```

### Components:
1. **IoT Devices**: ESP32/Arduino/Raspberry Pi collecting solar panel data
2. **MQTT Broker**: Message broker (Mosquitto) for real-time communication
3. **Backend Server**: Node.js with IoT Manager service
4. **ML Service**: Python-based solar forecasting and anomaly detection
5. **Database**: PostgreSQL/TimescaleDB for time-series storage

---

## 🔧 Hardware Setup

### Required Components:

#### Option 1: ESP32 Development Kit
- **Microcontroller**: ESP32-DevKitC (Wi-Fi + Bluetooth)
- **Sensors**:
  - Voltage Sensor: ZMPT101B AC Voltage Sensor (0-250V)
  - Current Sensor: ACS712 30A Current Sensor
  - Temperature Sensor: DS18B20 Digital Temperature Sensor
  - Irradiance Sensor: BH1750 Light Intensity Sensor
- **Power**: 5V Power Supply / USB
- **Cost**: ~$30-50 USD

#### Option 2: Raspberry Pi 4 (More powerful)
- **Computer**: Raspberry Pi 4 (2GB+ RAM)
- **ADC**: MCP3008 8-Channel 10-Bit ADC (for analog sensors)
- **Sensors**: Same as ESP32 option
- **Cost**: ~$80-120 USD

#### Option 3: Arduino Nano 33 IoT
- **Microcontroller**: Arduino Nano 33 IoT (Built-in Wi-Fi)
- **Sensors**: Same as above
- **Cost**: ~$40-60 USD

### Wiring Diagram (ESP32):

```
┌─────────────────────────────────────────┐
│           Solar Panel (12V/24V DC)       │
└───────┬─────────────────────┬───────────┘
        │                     │
        ▼                     ▼
   ┌────────┐            ┌────────┐
   │ ZMPT101│            │ACS712  │
   │Voltage │            │Current │
   │Sensor  │            │Sensor  │
   └────┬───┘            └───┬────┘
        │                    │
        │ Analog Out    Analog Out
        │                    │
   ┌────▼────────────────────▼────────┐
   │         ESP32 DevKit-C            │
   │  ┌──────────────────────────┐    │
   │  │ GPIO34 (Voltage)         │    │
   │  │ GPIO35 (Current)         │    │
   │  │ GPIO4  (DS18B20 Temp)    │    │
   │  │ GPIO21 (BH1750 SDA)      │    │
   │  │ GPIO22 (BH1750 SCL)      │    │
   │  └──────────────────────────┘    │
   │           Wi-Fi Module            │
   └───────────────┬───────────────────┘
                   │
                   ▼ MQTT
          ┌────────────────┐
          │  MQTT Broker   │
          │ (Mosquitto)    │
          └────────────────┘
```

---

## 💻 Firmware Code (ESP32)

### ESP32 Arduino Sketch:

```cpp
// solar_panel_monitor.ino
#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <BH1750.h>
#include <ArduinoJson.h>

// Wi-Fi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration
const char* mqtt_server = "YOUR_BACKEND_IP";  // e.g., "192.168.1.100"
const int mqtt_port = 1883;
const char* device_id = "ESP32_SOLAR_001";  // Unique device ID

// Pin Definitions
#define VOLTAGE_PIN 34      // ADC1_CH6
#define CURRENT_PIN 35      // ADC1_CH7
#define TEMP_PIN 4          // OneWire
#define SDA_PIN 21          // I2C
#define SCL_PIN 22          // I2C

// Calibration Constants
const float VOLTAGE_CALIBRATION = 230.0 / 1024.0;  // V per ADC unit
const float CURRENT_CALIBRATION = 30.0 / 1024.0;    // A per ADC unit

// Objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);
BH1750 lightMeter;

// Data Structure
struct SolarData {
  float voltage;
  float current;
  float power_kw;
  float temperature;
  float irradiance;
  unsigned long timestamp;
};

void setup() {
  Serial.begin(115200);
  
  // Initialize sensors
  pinMode(VOLTAGE_PIN, INPUT);
  pinMode(CURRENT_PIN, INPUT);
  
  tempSensor.begin();
  Wire.begin(SDA_PIN, SCL_PIN);
  lightMeter.begin();
  
  // Connect to Wi-Fi
  connectWiFi();
  
  // Configure MQTT
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  
  Serial.println("✓ Solar Panel Monitor Initialized");
}

void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  // Read sensor data every 30 seconds
  static unsigned long lastReading = 0;
  if (millis() - lastReading > 30000) {
    SolarData data = readSensors();
    publishData(data);
    lastReading = millis();
  }
  
  delay(100);
}

// Connect to Wi-Fi
void connectWiFi() {
  Serial.print("Connecting to Wi-Fi...");
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n✓ Wi-Fi Connected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

// Reconnect to MQTT
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT...");
    
    if (mqttClient.connect(device_id)) {
      Serial.println("✓ MQTT Connected");
      
      // Subscribe to command topic
      String commandTopic = "solar/" + String(device_id) + "/command";
      mqttClient.subscribe(commandTopic.c_str());
      
      // Publish status
      publishStatus("online");
    } else {
      Serial.print("Failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" Retrying in 5s");
      delay(5000);
    }
  }
}

// MQTT Callback for commands
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("Command received: ");
  Serial.println(message);
  
  // Parse JSON command
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (!error) {
    const char* cmd = doc["command"];
    if (strcmp(cmd, "reset") == 0) {
      ESP.restart();
    } else if (strcmp(cmd, "status") == 0) {
      publishStatus("online");
    }
  }
}

// Read all sensors
SolarData readSensors() {
  SolarData data;
  
  // Read voltage (AC RMS)
  float voltageRaw = analogRead(VOLTAGE_PIN);
  data.voltage = voltageRaw * VOLTAGE_CALIBRATION;
  
  // Read current (AC RMS)
  float currentRaw = analogRead(CURRENT_PIN);
  data.current = currentRaw * CURRENT_CALIBRATION;
  
  // Calculate power (P = V × I)
  data.power_kw = (data.voltage * data.current) / 1000.0;
  
  // Read temperature
  tempSensor.requestTemperatures();
  data.temperature = tempSensor.getTempCByIndex(0);
  
  // Read irradiance (light intensity)
  data.irradiance = lightMeter.readLightLevel();
  
  // Timestamp
  data.timestamp = millis();
  
  return data;
}

// Publish sensor data to MQTT
void publishData(SolarData data) {
  StaticJsonDocument<300> doc;
  
  doc["device_id"] = device_id;
  doc["timestamp"] = data.timestamp;
  doc["voltage"] = data.voltage;
  doc["current"] = data.current;
  doc["power_kw"] = data.power_kw;
  doc["temperature"] = data.temperature;
  doc["irradiance"] = data.irradiance;
  doc["battery_voltage"] = 3.7;  // Optional: read battery
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "solar/" + String(device_id) + "/data";
  mqttClient.publish(topic.c_str(), payload.c_str());
  
  Serial.println("✓ Data published: " + payload);
}

// Publish device status
void publishStatus(const char* status) {
  StaticJsonDocument<200> doc;
  
  doc["device_id"] = device_id;
  doc["status"] = status;
  doc["signal_strength"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "solar/" + String(device_id) + "/status";
  mqttClient.publish(topic.c_str(), payload.c_str());
}
```

---

## 🐳 MQTT Broker Setup

### Using Docker (Recommended):

```bash
# Create mosquitto directory
mkdir -p ~/mosquitto/config ~/mosquitto/data ~/mosquitto/log

# Create configuration file
cat > ~/mosquitto/config/mosquitto.conf << EOF
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
EOF

# Run Mosquitto MQTT Broker
docker run -d \
  --name mosquitto \
  -p 1883:1883 \
  -p 9001:9001 \
  -v ~/mosquitto/config:/mosquitto/config \
  -v ~/mosquitto/data:/mosquitto/data \
  -v ~/mosquitto/log:/mosquitto/log \
  eclipse-mosquitto

# Verify running
docker logs mosquitto
```

### Using Mosquitto natively (Linux):

```bash
# Install Mosquitto
sudo apt update
sudo apt install mosquitto mosquitto-clients

# Configure
sudo nano /etc/mosquitto/mosquitto.conf
# Add:
# listener 1883
# allow_anonymous true

# Start service
sudo systemctl start mosquitto
sudo systemctl enable mosquitto

# Test
mosquitto_sub -h localhost -t "#" -v
```

---

## 🔗 Backend Integration

The backend already has IoT Manager (`/backend/src/services/iotManager.js`) configured:

### Key Features:
1. **MQTT Connection**: Listens to `solar/+/data` and `solar/+/status`
2. **Data Validation**: Validates sensor ranges
3. **ML Integration**: Batches data for solar forecasting
4. **Device Management**: Registers and tracks devices

### Configuration (.env):

```bash
# MQTT Configuration
MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=solar_backend
MQTT_PASSWORD=your_secure_password

# ML Service
ML_SERVICE_URL=http://localhost:8001
```

### API Endpoints:

```http
# Register IoT Device
POST /api/v1/iot/devices/register
Authorization: Bearer {token}
Content-Type: application/json

{
  "device_id": "ESP32_SOLAR_001",
  "name": "Rooftop Solar Panel 1",
  "location_id": "LOC123",
  "capacity_kw": 5.0,
  "panel_type": "monocrystalline",
  "installation_date": "2024-01-15"
}

# Get Device Status
GET /api/v1/iot/devices/ESP32_SOLAR_001
Authorization: Bearer {token}

# Get Device Forecast
GET /api/v1/iot/devices/ESP32_SOLAR_001/forecast
Authorization: Bearer {token}

# Get All Devices
GET /api/v1/iot/devices
Authorization: Bearer {token}

# Send Command to Device
POST /api/v1/iot/devices/ESP32_SOLAR_001/command
Authorization: Bearer {token}
Content-Type: application/json

{
  "command": "reset"
}
```

---

## 📊 Data Flow

```
ESP32/Device
    │
    │ 1. Read Sensors (30s interval)
    ▼
   MQTT Publish → solar/{device_id}/data
    │
    │ 2. MQTT Broker forwards
    ▼
Backend IoTManager
    │
    │ 3. Validate data
    ▼
Buffer (100 readings)
    │
    │ 4. When buffer full
    ▼
ML Service API
    │
    │ 5. Solar Forecast (24h)
    ▼
Database Storage
    │
    │ 6. Publish forecast
    ▼
   MQTT Publish → solar/{device_id}/forecast
    │
    ▼
Device receives forecast (optional)
```

---

## 🧪 Testing Without Hardware

### Using IoT Simulator:

```bash
cd /home/akash/Desktop/SOlar_Sharing/ml-service

# Activate Python environment
source venv/bin/activate

# Generate 24 hours of realistic data
python simulate_iot_data.py --duration 24 --interval 5

# Real-time mode (streams to backend API)
python simulate_iot_data.py --realtime --api-url http://localhost:3000/api/v1/iot/data

# Specific device ID
python simulate_iot_data.py --device-id ESP32_TEST_001 --duration 48
```

### Manual MQTT Testing:

```bash
# Subscribe to all solar topics
mosquitto_sub -h localhost -t "solar/#" -v

# Publish test data
mosquitto_pub -h localhost -t "solar/TEST001/data" -m '{
  "device_id": "TEST001",
  "timestamp": 1705747200000,
  "voltage": 230.5,
  "current": 18.2,
  "power_kw": 4.2,
  "temperature": 35.5,
  "irradiance": 850.0
}'

# Publish status
mosquitto_pub -h localhost -t "solar/TEST001/status" -m '{
  "device_id": "TEST001",
  "status": "online",
  "signal_strength": -45
}'
```

---

## 📈 ML Integration

The backend automatically triggers ML forecasting when data buffer is full:

### Solar Forecast API (called internally):

```http
POST http://localhost:8001/api/v1/forecast/solar
Content-Type: application/json

{
  "host_id": "ESP32_SOLAR_001",
  "panel_capacity_kw": 5.0,
  "historical_data": [
    {
      "timestamp": "2024-01-20T10:00:00Z",
      "power_kw": 4.2,
      "voltage": 230.5,
      "current": 18.2
    }
  ],
  "forecast_hours": 24
}
```

### Response:
```json
{
  "success": true,
  "predictions": [4.5, 4.8, 5.0, 4.9, ...],  // 24 values
  "confidence_intervals": {
    "lower": [4.0, 4.3, 4.5, ...],
    "upper": [5.0, 5.3, 5.5, ...]
  },
  "model_used": "solar_xgboost",
  "accuracy_score": 0.92
}
```

---

## 🔒 Security Best Practices

### 1. MQTT Authentication:

```bash
# Create password file
mosquitto_passwd -c /etc/mosquitto/passwd solar_device
mosquitto_passwd /etc/mosquitto/passwd solar_backend

# Update mosquitto.conf
allow_anonymous false
password_file /etc/mosquitto/passwd
```

### 2. TLS/SSL Encryption:

```bash
# Generate certificates
openssl req -new -x509 -days 365 -extensions v3_ca \
  -keyout ca.key -out ca.crt

# Update mosquitto.conf
listener 8883
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
```

### 3. Device Authentication:
- Each device has unique ID
- JWT tokens for API access
- Device registration approval flow

---

## 🎯 Production Deployment

### 1. Set up MQTT Broker on Cloud:

```bash
# AWS EC2 / DigitalOcean
ssh user@your-server-ip

# Install Docker & run Mosquitto
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

docker run -d \
  --name mosquitto \
  --restart always \
  -p 1883:1883 \
  -p 8883:8883 \
  -v /opt/mosquitto/config:/mosquitto/config \
  -v /opt/mosquitto/data:/mosquitto/data \
  eclipse-mosquitto
```

### 2. Configure Backend:

```bash
# Update .env
MQTT_URL=mqtt://your-server-ip:1883
ML_SERVICE_URL=http://ml-service-url:8001
```

### 3. Flash Firmware to Devices:
- Update `mqtt_server` in ESP32 code
- Upload sketch using Arduino IDE
- Monitor Serial output for connection status

---

## 📱 Mobile App Integration

Buyers and sellers can view real-time IoT data in the app:

### API for Frontend:

```typescript
// Get device real-time data
const deviceData = await api.get(`/iot/devices/${deviceId}`);

// Get 24h forecast
const forecast = await api.get(`/iot/devices/${deviceId}/forecast`);

// Display in chart
<LineChart
  data={forecast.predictions}
  labels={forecast.timestamps}
/>
```

---

## 🐛 Troubleshooting

### Device not connecting to MQTT:
```bash
# Check broker status
docker logs mosquitto

# Test from device location
mosquitto_pub -h YOUR_SERVER_IP -t "test" -m "hello"
```

### No data in backend:
```bash
# Check backend logs
npm run dev
# Look for "MQTT Connected" and "Subscribed to solar/+/data"

# Check MQTT subscriptions
mosquitto_sub -h localhost -t "solar/#" -v
```

### ML predictions not working:
```bash
# Verify ML service is running
curl http://localhost:8001/health

# Check backend calls ML
tail -f backend/logs/combined.log | grep "ML Service"
```

---

## 📚 Additional Resources

- **ESP32 Docs**: https://docs.espressif.com/projects/esp-idf/
- **MQTT Protocol**: https://mqtt.org/
- **Mosquitto**: https://mosquitto.org/documentation/
- **Arduino JSON**: https://arduinojson.org/
- **Solar Panel Specs**: Refer to manufacturer datasheets

---

## 🎉 Next Steps

1. ✅ Purchase IoT hardware components
2. ✅ Set up MQTT broker (Docker)
3. ✅ Flash ESP32 firmware
4. ✅ Register device via API
5. ✅ Monitor real-time data in backend logs
6. ✅ Verify ML forecasting is working
7. ✅ Deploy to production server

---

**Need help?** Check logs in:
- Backend: `/backend/logs/`
- ML Service: `/ml-service/logs/`
- MQTT: `docker logs mosquitto`
