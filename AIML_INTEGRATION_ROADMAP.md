# AI/ML Integration Roadmap

## Overview
This document outlines the AI/ML features to enhance the Solar Sharing Platform with intelligent automation and fraud detection.

---

## 1. Document Authenticity Detection (Priority: HIGH)

### 1.1 Problem Statement
Verify uploaded solar panel documents are genuine and not forged/tampered.

### 1.2 Approach

#### Image Forensics
**Techniques:**
- **Copy-Move Detection:** Detect duplicated regions (fake stamps/signatures)
- **Error Level Analysis (ELA):** Different compression levels indicate editing
- **Noise Analysis:** Check for consistent noise patterns
- **JPEG Artifacts:** Multiple saves show compression artifacts

**Implementation:**
```python
# Python (OpenCV + scikit-image)
import cv2
import numpy as np
from skimage.measure import compare_ssim

def detect_copy_move(image_path):
    """Detect duplicated regions in image"""
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    
    # Divide image into blocks
    block_size = 16
    blocks = []
    for i in range(0, img.shape[0] - block_size, block_size):
        for j in range(0, img.shape[1] - block_size, block_size):
            block = img[i:i+block_size, j:j+block_size]
            blocks.append((i, j, block))
    
    # Find similar blocks (potential copy-move)
    similar_blocks = []
    for idx1, (i1, j1, b1) in enumerate(blocks):
        for idx2, (i2, j2, b2) in enumerate(blocks[idx1+1:]):
            similarity = compare_ssim(b1, b2)
            if similarity > 0.95:  # 95% similarity threshold
                similar_blocks.append((i1, j1, i2, j2))
    
    return len(similar_blocks) > 0  # True if copy-move detected

def error_level_analysis(image_path):
    """Detect image manipulation via ELA"""
    img = cv2.imread(image_path)
    
    # Save with specific quality
    temp_path = '/tmp/ela_temp.jpg'
    cv2.imwrite(temp_path, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    
    # Load both images
    original = cv2.imread(image_path)
    compressed = cv2.imread(temp_path)
    
    # Calculate difference
    diff = cv2.absdiff(original, compressed)
    
    # High variance in diff indicates editing
    variance = np.var(diff)
    return variance > 1000  # Threshold for manipulation
```

#### Deep Learning Model
**Architecture:** EfficientNet-B0 (transfer learning)

**Training Data:**
- **Authentic Documents:** 1000+ electricity bills, invoices, certificates
  - Sources: Anonymized real documents, publicly available samples
- **Fake Documents:** 500+ tampered versions
  - Methods: Photoshop edits, text replacement, stamp duplication

**Model Training:**
```python
import tensorflow as tf
from tensorflow.keras.applications import EfficientNetB0
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout
from tensorflow.keras.models import Model

# Load base model
base_model = EfficientNetB0(weights='imagenet', include_top=False, input_shape=(224, 224, 3))

# Freeze base layers
base_model.trainable = False

# Add custom head
x = base_model.output
x = GlobalAveragePooling2D()(x)
x = Dense(512, activation='relu')(x)
x = Dropout(0.5)(x)
x = Dense(256, activation='relu')(x)
x = Dropout(0.3)(x)
predictions = Dense(2, activation='softmax')(x)  # [authentic, fake]

model = Model(inputs=base_model.input, outputs=predictions)

# Compile
model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
    loss='categorical_crossentropy',
    metrics=['accuracy', 'precision', 'recall']
)

# Train
history = model.fit(
    train_dataset,
    epochs=20,
    validation_data=val_dataset,
    callbacks=[
        tf.keras.callbacks.EarlyStopping(patience=3),
        tf.keras.callbacks.ModelCheckpoint('best_model.h5', save_best_only=True)
    ]
)
```

**Deployment:**
```python
# Flask API for model inference
from flask import Flask, request, jsonify
import tensorflow as tf
import cv2
import numpy as np

app = Flask(__name__)
model = tf.keras.models.load_model('best_model.h5')

@app.route('/predict', methods=['POST'])
def predict():
    file = request.files['document']
    
    # Preprocess image
    img = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, (224, 224))
    img = img / 255.0
    img = np.expand_dims(img, axis=0)
    
    # Predict
    prediction = model.predict(img)
    authenticity_score = float(prediction[0][0] * 100)  # 0-100
    
    return jsonify({
        'authenticity_score': authenticity_score,
        'is_authentic': authenticity_score > 85,
        'flags': {
            'low_confidence': authenticity_score < 60,
            'potential_tampering': authenticity_score < 50
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

**Backend Integration:**
```javascript
// backend/src/services/AIVerificationService.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const config = require('../config');

class AIVerificationService {
  async analyzeDocument(filePath) {
    try {
      const form = new FormData();
      form.append('document', fs.createReadStream(filePath));
      
      const response = await axios.post(
        `${config.mlServiceUrl}/predict`,
        form,
        { headers: form.getHeaders(), timeout: 30000 }
      );
      
      return response.data;
    } catch (error) {
      logger.error('AI verification failed:', error);
      return { authenticity_score: 50, flags: { error: true } };
    }
  }
}

module.exports = new AIVerificationService();
```

---

## 2. Fraud Detection in Transactions (Priority: MEDIUM)

### 2.1 Problem Statement
Identify suspicious trading patterns (meter tampering, fake energy claims).

### 2.2 Approach

#### Anomaly Detection
**Model:** Isolation Forest (unsupervised learning)

**Features:**
- Transaction frequency (transactions/day)
- Energy generation (kWh/day vs panel capacity)
- Price deviation (price vs market average)
- Time patterns (selling at odd hours)
- Geographic patterns (same location, multiple accounts)

**Implementation:**
```python
from sklearn.ensemble import IsolationForest
import pandas as pd

# Load transaction data
df = pd.read_csv('energy_transactions.csv')

# Feature engineering
df['energy_per_kw'] = df['energy_kwh'] / df['panel_capacity_kw']
df['price_deviation'] = (df['price_per_kwh'] - df['market_avg_price']) / df['market_avg_price']
df['transactions_per_day'] = df.groupby('seller_id')['created_at'].transform('count') / 30

features = [
    'energy_per_kw',
    'price_deviation',
    'transactions_per_day',
    'avg_transaction_amount',
    'account_age_days'
]

X = df[features]

# Train Isolation Forest
model = IsolationForest(contamination=0.05, random_state=42)
model.fit(X)

# Predict anomalies
df['anomaly_score'] = model.decision_function(X)
df['is_anomaly'] = model.predict(X)  # -1 for anomalies, 1 for normal

# Flag suspicious transactions
suspicious = df[df['is_anomaly'] == -1]
print(f"Found {len(suspicious)} suspicious transactions")
```

**Real-time Scoring API:**
```python
# Flask API
@app.route('/fraud-score', methods=['POST'])
def fraud_score():
    data = request.json
    
    features = np.array([[
        data['energy_per_kw'],
        data['price_deviation'],
        data['transactions_per_day'],
        data['avg_transaction_amount'],
        data['account_age_days']
    ]])
    
    score = model.decision_function(features)[0]
    is_fraud = score < -0.5  # Threshold
    
    return jsonify({
        'fraud_score': float(score),
        'is_suspicious': bool(is_fraud),
        'risk_level': 'high' if score < -0.7 else 'medium' if score < -0.4 else 'low'
    })
```

---

## 3. Energy Generation Prediction (Priority: MEDIUM)

### 3.3 Problem Statement
Verify claimed energy generation matches expected output (catch meter fraud).

### 3.2 Approach

#### Time Series Model
**Model:** LSTM (Long Short-Term Memory)

**Inputs:**
- Panel capacity (kW)
- Location (latitude, longitude)
- Weather data (temperature, cloud cover, rainfall)
- Historical generation
- Month/season
- Day of week

**Expected Output:** Energy generated (kWh) for next 7 days

**Implementation:**
```python
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout

# Prepare data
def create_sequences(data, seq_length=7):
    X, y = [], []
    for i in range(len(data) - seq_length):
        X.append(data[i:i+seq_length])
        y.append(data[i+seq_length])
    return np.array(X), np.array(y)

# Features: [sunlight_hours, temperature, cloud_cover, panel_capacity]
seq_length = 7
X_train, y_train = create_sequences(train_data, seq_length)
X_test, y_test = create_sequences(test_data, seq_length)

# Build LSTM model
model = Sequential([
    LSTM(128, return_sequences=True, input_shape=(seq_length, 4)),
    Dropout(0.2),
    LSTM(64, return_sequences=False),
    Dropout(0.2),
    Dense(32, activation='relu'),
    Dense(1)  # Predicted energy (kWh)
])

model.compile(optimizer='adam', loss='mse', metrics=['mae'])

# Train
model.fit(X_train, y_train, epochs=50, validation_data=(X_test, y_test))

# Predict
def predict_generation(panel_capacity, location, date):
    # Fetch weather data for location + date
    weather = get_weather_forecast(location, date)
    
    # Prepare input sequence
    features = np.array([[
        weather['sunlight_hours'],
        weather['temperature'],
        weather['cloud_cover'],
        panel_capacity
    ]])
    
    # Predict
    predicted_kwh = model.predict(features)[0][0]
    return predicted_kwh
```

**Verification Logic:**
```javascript
// backend/src/services/GenerationVerificationService.js
const axios = require('axios');

class GenerationVerificationService {
  async verifyClaimedGeneration(userId, claimedKwh, date) {
    const user = await getUserDetails(userId);
    const panelCapacity = user.panel_capacity_kw;
    const location = { lat: user.latitude, lon: user.longitude };
    
    // Get ML prediction
    const predicted = await axios.post(`${config.mlServiceUrl}/predict-generation`, {
      panel_capacity: panelCapacity,
      location,
      date
    });
    
    const expectedKwh = predicted.data.energy_kwh;
    const deviation = Math.abs(claimedKwh - expectedKwh) / expectedKwh;
    
    // Allow 30% deviation (weather unpredictability)
    if (deviation > 0.30) {
      return {
        verified: false,
        reason: 'Claimed generation deviates significantly from expected',
        claimed: claimedKwh,
        expected: expectedKwh,
        deviation_percent: deviation * 100
      };
    }
    
    return { verified: true };
  }
}
```

---

## 4. Dynamic Pricing Optimization (Priority: LOW)

### 4.1 Problem Statement
Suggest optimal pricing for sellers based on demand, time, location.

### 4.2 Approach

#### Reinforcement Learning
**Model:** Q-Learning

**State:**
- Current time (hour of day)
- Day of week
- Location (neighborhood)
- Available supply (total kWh available in area)
- Demand (recent purchases in area)

**Action:** Set price (₹4-₹10 per kWh)

**Reward:**
- +1 for successful sale
- +0.5 for competitive pricing (within 10% of market)
- -0.5 for no sale within 24 hours
- -1 for price too high (no buyers)

**Implementation:**
```python
import numpy as np
import random

# Q-Learning Agent
class PricingAgent:
    def __init__(self, actions=[4, 5, 6, 7, 8, 9, 10]):
        self.actions = actions
        self.q_table = {}  # state -> action -> Q-value
        self.learning_rate = 0.1
        self.discount_factor = 0.95
        self.epsilon = 0.1  # Exploration rate
    
    def get_state(self, hour, day_of_week, supply, demand):
        return (hour, day_of_week, supply // 10, demand // 10)
    
    def choose_action(self, state):
        if random.random() < self.epsilon:
            return random.choice(self.actions)  # Explore
        
        if state not in self.q_table:
            self.q_table[state] = {a: 0 for a in self.actions}
        
        return max(self.q_table[state], key=self.q_table[state].get)  # Exploit
    
    def update(self, state, action, reward, next_state):
        if state not in self.q_table:
            self.q_table[state] = {a: 0 for a in self.actions}
        if next_state not in self.q_table:
            self.q_table[next_state] = {a: 0 for a in self.actions}
        
        current_q = self.q_table[state][action]
        max_next_q = max(self.q_table[next_state].values())
        
        new_q = current_q + self.learning_rate * (reward + self.discount_factor * max_next_q - current_q)
        self.q_table[state][action] = new_q

# Train agent on historical data
agent = PricingAgent()
for episode in range(1000):
    # Simulate market conditions
    hour = random.randint(0, 23)
    day = random.randint(0, 6)
    supply = random.randint(10, 100)
    demand = random.randint(5, 80)
    
    state = agent.get_state(hour, day, supply, demand)
    action = agent.choose_action(state)
    
    # Simulate sale outcome
    market_price = 6.0
    if abs(action - market_price) < 1:
        reward = 1 if random.random() < 0.8 else 0
    else:
        reward = -0.5
    
    next_state = agent.get_state(hour + 1, day, supply - 10, demand + 5)
    agent.update(state, action, reward, next_state)

# Save model
import pickle
with open('pricing_agent.pkl', 'wb') as f:
    pickle.dump(agent, f)
```

**API Endpoint:**
```python
@app.route('/suggest-price', methods=['POST'])
def suggest_price():
    data = request.json
    
    state = agent.get_state(
        data['hour'],
        data['day_of_week'],
        data['supply'],
        data['demand']
    )
    
    optimal_price = agent.choose_action(state)
    
    return jsonify({
        'suggested_price': optimal_price,
        'confidence': 0.85,
        'market_avg': 6.0
    })
```

---

## 5. OCR for Document Data Extraction (Priority: HIGH)

### 5.1 Problem Statement
Extract structured data from uploaded documents (consumer number, panel capacity, etc.).

### 5.2 Approach

#### Option 1: Tesseract.js (Free, Offline)
```javascript
// backend/src/services/OCRService.js
const Tesseract = require('tesseract.js');

class OCRService {
  async extractText(imagePath) {
    const { data: { text } } = await Tesseract.recognize(
      imagePath,
      'eng',
      { logger: m => console.log(m) }
    );
    
    return text;
  }
  
  parseElectricityBill(text) {
    // Extract consumer number (pattern: 12-15 digits)
    const consumerNumberMatch = text.match(/Consumer No[:\s]*(\d{12,15})/i);
    const consumerNumber = consumerNumberMatch ? consumerNumberMatch[1] : null;
    
    // Extract address
    const addressMatch = text.match(/Address[:\s]*(.+?)\n/i);
    const address = addressMatch ? addressMatch[1].trim() : null;
    
    return { consumerNumber, address };
  }
  
  parseSolarInvoice(text) {
    // Extract panel capacity (e.g., "5 kW", "5.5kW")
    const capacityMatch = text.match(/(\d+\.?\d*)\s*kW/i);
    const panelCapacityKw = capacityMatch ? parseFloat(capacityMatch[1]) : null;
    
    // Extract installer name
    const installerMatch = text.match(/Installer[:\s]*(.+?)\n/i);
    const installerName = installerMatch ? installerMatch[1].trim() : null;
    
    return { panelCapacityKw, installerName };
  }
}

module.exports = new OCRService();
```

#### Option 2: Google Cloud Vision API (Paid, High Accuracy)
```javascript
const vision = require('@google-cloud/vision');

class OCRService {
  constructor() {
    this.client = new vision.ImageAnnotatorClient({
      keyFilename: './google-cloud-key.json'
    });
  }
  
  async extractText(imagePath) {
    const [result] = await this.client.textDetection(imagePath);
    const text = result.fullTextAnnotation.text;
    return text;
  }
}
```

**Integration with Verification Flow:**
```javascript
// backend/src/controllers/verificationController.js
const OCRService = require('../services/OCRService');
const DocumentVerificationService = require('../services/DocumentVerificationService');

const uploadDocument = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;
  const { documentType } = req.body;
  const file = req.file;
  
  // Save document
  await DocumentVerificationService.uploadDocument(verificationId, documentType, file.path);
  
  // Trigger OCR extraction (async)
  if (documentType === 'electricity_bill' || documentType === 'solar_invoice') {
    const text = await OCRService.extractText(file.path);
    
    let extractedData = {};
    if (documentType === 'electricity_bill') {
      extractedData = OCRService.parseElectricityBill(text);
    } else if (documentType === 'solar_invoice') {
      extractedData = OCRService.parseSolarInvoice(text);
    }
    
    // Update verification with extracted data
    await DocumentVerificationService.updateExtractedData(verificationId, extractedData);
  }
  
  res.json({ message: 'Document uploaded and OCR triggered' });
});
```

---

## 6. Implementation Timeline

### Week 1-2: OCR Integration
- [ ] Install Tesseract.js / Google Cloud Vision API
- [ ] Create OCRService.js
- [ ] Build regex parsers for Indian documents
- [ ] Test on sample documents

### Week 3-4: Document Authenticity Model
- [ ] Collect training data (1000+ documents)
- [ ] Train EfficientNet model (Python)
- [ ] Deploy Flask API
- [ ] Integrate with backend

### Week 5-6: Fraud Detection
- [ ] Extract transaction features
- [ ] Train Isolation Forest model
- [ ] Create real-time scoring API
- [ ] Add fraud alerts to admin dashboard

### Week 7-8: Energy Generation Prediction
- [ ] Integrate weather API
- [ ] Collect historical generation data
- [ ] Train LSTM model
- [ ] Implement verification logic

### Week 9-10: Dynamic Pricing (Optional)
- [ ] Train Q-Learning agent on historical data
- [ ] Create price suggestion API
- [ ] Add UI component in frontend

---

## 7. Cost Estimation

| Component | Option | Cost (per month) |
|-----------|--------|------------------|
| OCR | Tesseract.js (self-hosted) | ₹0 (compute only) |
| OCR | Google Cloud Vision API | ₹1.50/1000 images |
| ML Model Hosting | AWS EC2 t3.medium | ₹3,000/month |
| ML Model Hosting | AWS Lambda | ₹500/month (pay-per-use) |
| Weather API | OpenWeatherMap (free tier) | ₹0 (60 calls/min) |
| Weather API | WeatherAPI.com (paid) | ₹1,000/month |
| **Total (Free Tier)** | | **₹3,000-4,000/month** |
| **Total (Paid Services)** | | **₹5,500-7,000/month** |

---

## 8. Success Metrics

- **Document Verification Accuracy:** 95%+ (false positive rate < 5%)
- **Fraud Detection Rate:** Catch 90%+ anomalies
- **OCR Accuracy:** 90%+ field extraction accuracy
- **Generation Prediction:** Within ±30% of actual
- **Price Optimization:** Increase seller revenue by 10-15%

---

## 9. Next Steps

1. Start with **OCR integration** (high priority, enables automated verification)
2. Collect **training data** for document authenticity model
3. Implement **fraud detection** on existing transaction data
4. Deploy **ML services** on separate server/container
5. Monitor and iterate based on real-world performance

---

**For implementation help, refer to Python/TensorFlow documentation or contact ML team.**
