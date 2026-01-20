#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ===== WiFi Credentials =====
#define WIFI_SSID      "moto"
#define WIFI_PASSWORD  "12345679"

// ===== Backend Config =====
#define BACKEND_BASE_URL "https://sol-bridge.onrender.com"
#define API_PREFIX       "/api/v1"

// ===== Device Identity =====
// Get this device_id from the app after registering your device
// Format: solar_meter-<user_id_prefix>-<timestamp>
#define DEVICE_ID       "ESP32_SOLAR_001"  // TODO: Replace with device_id from app registration

// ===== Pin Definitions =====
#define VOLTAGE_PIN     35    // ADC1 - AC Voltage sensor
#define CURRENT_PIN     34    // ADC1 - Current sensor
#define TEMP_PIN        4     // GPIO 4 - Temperature sensor (DHT22/DS18B20)
#define FREQ_PIN        5     // GPIO 5 - Frequency detection (zero-crossing)

// ===== Sensor Configuration =====
#define DHTTYPE DHT22
DHT dht(TEMP_PIN, DHTTYPE);

// ===== Calibration Constants =====
// For demo 70x70 panels: Direct ADC read, no voltage divider needed
#define ADC_MAX 4095.0              // 12-bit ADC max value
#define ADC_VREF 3.3                // ADC reference voltage
#define ACS712_SENSITIVITY 0.185    // ACS712-30A: 185mV/A
#define ACS712_CENTER 1.65          // Center voltage at 0A

void connectWifi() {
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi connected. IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("WiFi connection failed");
  }
}

// Read DC Voltage from solar panel (direct ADC, no divider needed for small panels)
float readVoltage() {
  float sum = 0;
  int samples = 100;
  
  for (int i = 0; i < samples; i++) {
    int rawValue = analogRead(VOLTAGE_PIN);
    // Convert ADC reading to voltage: (rawValue / 4095) * 3.3V
    float voltage = (rawValue / ADC_MAX) * ADC_VREF;
    sum += voltage;
    delay(10);
  }
  
  return sum / samples;  // Return average voltage
}

// Read DC Current from ACS712 current sensor
float readCurrent() {
  float sum = 0;
  int samples = 100;
  
  for (int i = 0; i < samples; i++) {
    int rawValue = analogRead(CURRENT_PIN);
    float voltage = (rawValue / ADC_MAX) * ADC_VREF;
    // Current = (Voltage - Center) / Sensitivity
    float current = (voltage - ACS712_CENTER) / ACS712_SENSITIVITY;
    sum += current;
    delay(10);
  }
  
  return abs(sum / samples);  // Return average current (absolute value)
}

// Read Temperature
float readTemperature() {
  float temp = dht.readTemperature();
  if (isnan(temp)) {
    Serial.println("Failed to read temperature!");
    return 30.0;  // fallback
  }
  return temp;
}

// Detect Frequency (50 or 60 Hz)
float readFrequency() {
  // Simple zero-crossing detection
  unsigned long crossings = 0;
  unsigned long timeout = 1000000;  // 1 second
  unsigned long start = micros();
  
  int lastState = digitalRead(FREQ_PIN);
  
  while (micros() - start < timeout) {
    int currentState = digitalRead(FREQ_PIN);
    if (currentState != lastState) {
      crossings++;
      lastState = currentState;
    }
  }
  
  // Frequency = (crossings / 2) / 1 second
  float frequency = (crossings / 2.0);
  return frequency;  // typically 50 or 60
}

bool postReading(float powerKW, float voltage, float current, float frequency, float temperature) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return false;
  }

  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + String(API_PREFIX) + "/iot/ingest";
  
  // For ESP32 core 3.3.2: setInsecure() is unavailable; use timeouts instead.
  // If HTTPS fails, switch BACKEND_BASE_URL to http://sol-bridge.onrender.com temporarily.
  http.setConnectTimeout(5000);
  http.setTimeout(10000);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Backend requires ISO8601 timestamp; using static UTC placeholder if no RTC/NTP
  String timestamp = "1970-01-01T00:00:00Z";

  String body = "{";
  body += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  body += "\"timestamp\":\"" + timestamp + "\",";
  body += "\"measurements\":{";
  body += "\"power_kw\":" + String(powerKW, 3) + ",";
  body += "\"voltage\":" + String(voltage, 1) + ",";
  body += "\"current\":" + String(current, 2) + ",";
  body += "\"frequency\":" + String(frequency, 2) + ",";
  body += "\"temperature\":" + String(temperature, 1);
  body += "}}";

  Serial.printf("\n=== Sending IoT Data ===\n");
  Serial.printf("URL: %s\n", url.c_str());
  Serial.printf("Body: %s\n", body.c_str());

  int code = http.POST(body);
  Serial.printf("Response Code: %d\n", code);

  if (code > 0) {
    String payload = http.getString();
    Serial.printf("Response: %s\n", payload.c_str());
  } else {
    Serial.printf("HTTP POST failed: %s\n", http.errorToString(code).c_str());
  }

  http.end();
  Serial.println("=======================\n");
  
  return code == 200;
}

void setup() {
  Serial.begin(115200);
  delay(800);
  
  pinMode(FREQ_PIN, INPUT);
  dht.begin();
  
  Serial.println("\n\n=== ESP32 Solar Sensor Starting ===");
  connectWifi();
}

void loop() {
  // Read actual sensors
  float voltage = readVoltage();
  float current = readCurrent();
  float temperature = readTemperature();
  float frequency = readFrequency();
  float powerKW = (voltage * current) / 1000.0;  // Calculate power

  Serial.printf("V:%.1f  I:%.2f  P:%.3f  F:%.1f  T:%.1f\n", 
    voltage, current, powerKW, frequency, temperature);

  bool ok = postReading(powerKW, voltage, current, frequency, temperature);
  if (!ok) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Reconnecting WiFi...");
      connectWifi();
    }
  }

  delay(10000);  // Every 10 seconds
}
