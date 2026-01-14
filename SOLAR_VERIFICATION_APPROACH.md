# Solar Panel Verification System - Implementation Approach

## Overview
This document outlines the approach to verify actual solar panel installations in India using government records and AI/ML techniques.

---

## 1. Government Data Sources (India)

### 1.1 Central Level
- **Ministry of New and Renewable Energy (MNRE)**
  - Maintains Solar Rooftop Portal
  - Registration of all subsidy-claimed installations
  - API: Not publicly available (requires government partnership)
  - Alternative: Web scraping (legally compliant)

- **Central Electricity Authority (CEA)**
  - Power generation data
  - Renewable energy certificates (RECs)

### 1.2 State Level
- **State Electricity Boards (DISCOMs)**
  - Bescom (Bangalore)
  - TSSPDCL/TSNPDCL (Telangana)
  - MSEDCL (Maharashtra)
  - Net metering approvals
  - Unique Consumer ID linked to solar installations

- **State Nodal Agencies**
  - Karnataka Renewable Energy Development Limited (KREDL)
  - Telangana State Renewable Energy Development Corporation (TSREDCO)
  - Maintain installer databases and subsidy records

### 1.3 Subsidy Schemes
- **PM-KUSUM (Pradhan Mantri Kisan Urja Suraksha evam Utthan Mahabhiyaan)**
  - Registration numbers for farmers
- **Rooftop Solar Programme Phase-II**
  - Online portal with beneficiary data

---

## 2. Required Documents for Verification

### 2.1 Mandatory Documents
1. **Electricity Bill with Net Metering**
   - Shows bi-directional meter installation
   - Consumer number
   - Registered address

2. **Solar Panel Installation Invoice**
   - Installer company details (MNRE-registered vendor)
   - Panel specifications (make, model, capacity)
   - Installation date

3. **Installation Certificate**
   - Issued by certified installer
   - Installer MNRE registration number
   - Technical specifications

4. **Net Metering Agreement**
   - Between consumer and DISCOM
   - Approval letter with reference number

5. **Subsidy Approval Letter** (if applicable)
   - MNRE/State agency approval
   - Unique subsidy ID

### 2.2 Supporting Documents
6. **Property Ownership Proof**
   - Property tax receipt
   - Electricity bill (same address)
   - Aadhaar/PAN card

7. **KYC Documents**
   - Aadhaar card
   - PAN card
   - Bank account (for receiving payments)

---

## 3. Verification Process (4-Level System)

### Level 1: Document Upload & OCR Extraction
**Technology:**
- Tesseract.js (open-source, offline)
- Google Cloud Vision API (high accuracy)
- AWS Textract (paid, excellent for invoices)

**Process:**
1. User uploads documents (PDF/JPEG/PNG)
2. OCR extracts:
   - Consumer number from electricity bill
   - Panel capacity, installer name from invoice
   - Net metering approval number
   - Subsidy ID (if applicable)
3. Store extracted data in structured format

**Implementation:**
```javascript
// Pseudo-code
const extractedData = await ocrService.extractText(document);
const parsedData = {
  consumerNumber: regex.match(extractedData, /Consumer No: (\d+)/),
  panelCapacity: regex.match(extractedData, /(\d+\.?\d*)\s*kW/),
  installerName: regex.match(extractedData, /Installer: (.+)/),
  netMeteringNumber: regex.match(extractedData, /NM-\d+/),
};
```

---

### Level 2: Automated Validation
**Checks:**
1. **Cross-Document Consistency**
   - Name matches across all documents
   - Address consistency (electricity bill, property proof)
   - Consumer number matches net metering agreement

2. **Format Validation**
   - Net metering number format: `NM-[STATE]-[DISCOM]-[NUMBER]`
   - MNRE installer registration: `MNRE/[STATE]/[YEAR]/[NUMBER]`
   - PAN card format: `[A-Z]{5}[0-9]{4}[A-Z]`

3. **Date Logic Checks**
   - Installation date < Current date
   - Subsidy approval date < Installation date
   - Net metering approval date ≈ Installation date (±30 days)

4. **Installer Verification**
   - Check against MNRE-registered vendor list (scraped/cached)
   - Installer GST number validation via GST API

**Result:**
- **Pass:** Proceed to Level 3
- **Fail:** Flag for manual review + notify user of discrepancies

---

### Level 3: AI/ML Document Authenticity Detection
**Purpose:** Detect forged/tampered documents

**Techniques:**

#### 3.1 Image Forensics
- **Copy-Move Detection:** Identify duplicated regions (fake stamps)
- **Noise Analysis:** Authentic documents have consistent noise patterns
- **JPEG Artifact Analysis:** Different compression levels indicate editing
- **Library:** OpenCV, scikit-image

#### 3.2 Text Consistency Analysis
- **Font Matching:** Official documents use specific fonts
- **Layout Analysis:** Government documents follow templates
- **Language Model:** Check grammar/spelling (fake documents have errors)

#### 3.3 Deep Learning Model
**Architecture:**
- **Input:** Document image (224x224 RGB)
- **Model:** EfficientNet-B0 (transfer learning)
- **Output:** `[authentic, fake]` probability

**Training Data:**
- Collect 1000+ real electricity bills/invoices (anonymized)
- Generate synthetic fakes (Photoshop edits, text replacement)
- Augment: rotation, brightness, blur

**Deployment:**
- TensorFlow.js (client-side) or TensorFlow Serving (backend)
- Confidence threshold: 85% (below → manual review)

**Code Snippet:**
```python
# Training (Python)
from tensorflow.keras.applications import EfficientNetB0
model = EfficientNetB0(weights='imagenet', include_top=False)
# Add classification head
# Train on authentic vs fake documents
```

---

### Level 4: Government Database Cross-Check
**API Integration:**

#### 4.1 DISCOM APIs (if available)
- **Endpoint:** `https://bescom.org/api/verify-consumer`
- **Request:** `{ consumer_number, consumer_name }`
- **Response:** `{ exists: true, solar_installed: true, capacity_kw: 5.0 }`

**Note:** Most DISCOMs don't have public APIs. Alternatives:
- **Partnership Approach:** Official collaboration with state electricity boards
- **Web Scraping:** Automate bill verification portals (check consumer number)
- **Manual Verification:** Admin calls DISCOM helpline

#### 4.2 MNRE Solar Rooftop Portal
- **Portal:** https://solarrooftop.gov.in/
- **Check:** Subsidy beneficiary list (if claimed subsidy)
- **Method:** Web scraping (quarterly updates)

#### 4.3 GST Verification (for installers)
- **API:** GST India API (https://gst.gov.in/)
- **Verify:** Installer GST number is active
- **Cross-check:** Installer name matches documents

---

### Level 5: Manual Admin Review
**For cases that fail automated checks:**

**Admin Dashboard Features:**
1. **Document Viewer:**
   - Side-by-side comparison of all uploaded documents
   - Highlighted discrepancies (name mismatch, date inconsistencies)

2. **AI Confidence Score:**
   - Display ML model's authenticity score
   - Show which checks failed (e.g., "font mismatch detected")

3. **Action Buttons:**
   - **Approve:** Mark user as verified solar seller
   - **Reject:** Send reason (missing documents, fake invoices)
   - **Request More Info:** Ask user to upload additional proof

4. **Audit Log:**
   - Track who approved/rejected and when
   - Store admin notes

---

## 4. Database Schema

### 4.1 `solar_verifications` Table
```sql
CREATE TABLE solar_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status
  verification_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Values: pending, documents_uploaded, ocr_completed, auto_validated, ai_checked, govt_verified, approved, rejected
  rejection_reason TEXT,
  
  -- Documents
  electricity_bill_path TEXT,
  solar_invoice_path TEXT,
  installation_certificate_path TEXT,
  net_metering_agreement_path TEXT,
  subsidy_approval_path TEXT,
  property_proof_path TEXT,
  kyc_documents_path TEXT,
  
  -- Extracted Data (from OCR)
  consumer_number VARCHAR(100),
  panel_capacity_kw DECIMAL(10, 2),
  installer_name VARCHAR(255),
  installer_mnre_reg VARCHAR(100),
  net_metering_number VARCHAR(100),
  subsidy_id VARCHAR(100),
  installation_date DATE,
  
  -- Validation Results
  cross_document_check_passed BOOLEAN DEFAULT FALSE,
  format_validation_passed BOOLEAN DEFAULT FALSE,
  date_logic_check_passed BOOLEAN DEFAULT FALSE,
  installer_verified BOOLEAN DEFAULT FALSE,
  
  -- AI Analysis
  document_authenticity_score DECIMAL(5, 2), -- 0.00 to 100.00
  ai_flags JSONB, -- { "copy_move_detected": true, "suspicious_font": false }
  
  -- Government Verification
  govt_api_verified BOOLEAN DEFAULT FALSE,
  govt_response JSONB, -- Store API response
  
  -- Admin Review
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  
  -- Metadata
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_verifications_user ON solar_verifications(user_id);
CREATE INDEX idx_verifications_status ON solar_verifications(verification_status);
CREATE INDEX idx_verifications_submitted ON solar_verifications(submitted_at DESC);
```

### 4.2 Update `users` Table
```sql
ALTER TABLE users ADD COLUMN is_verified_seller BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN verification_id UUID REFERENCES solar_verifications(id);
ALTER TABLE users ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;
```

---

## 5. Implementation Roadmap

### Phase 1: Document Upload System (Week 1)
- [ ] Create file upload API (multer)
- [ ] Store documents in S3/local storage
- [ ] Create database schema
- [ ] Build frontend upload form

### Phase 2: OCR Integration (Week 2)
- [ ] Integrate Tesseract.js/Google Vision API
- [ ] Build regex parsers for Indian documents
- [ ] Test on sample electricity bills/invoices
- [ ] Store extracted data

### Phase 3: Automated Validation (Week 3)
- [ ] Implement cross-document checks
- [ ] Format validation (regex patterns)
- [ ] Date logic checks
- [ ] MNRE installer list scraping + verification

### Phase 4: AI Document Verification (Week 4-5)
- [ ] Collect training data (authentic + fake documents)
- [ ] Train EfficientNet model (Python)
- [ ] Deploy model (TensorFlow Serving)
- [ ] Integrate API into backend

### Phase 5: Government API Integration (Week 6)
- [ ] Research DISCOM APIs (state-wise)
- [ ] Implement web scraping fallback
- [ ] GST verification API integration
- [ ] MNRE portal scraping

### Phase 6: Admin Dashboard (Week 7)
- [ ] Build admin panel (React)
- [ ] Document viewer with annotations
- [ ] Approve/reject workflow
- [ ] Audit logging

### Phase 7: Testing & Launch (Week 8)
- [ ] End-to-end testing with real documents
- [ ] Security audit (prevent fake uploads)
- [ ] Load testing (handle 1000 verifications/day)
- [ ] Deploy to production

---

## 6. AI/ML Enhancements (Beyond Document Verification)

### 6.1 Fraud Detection in Transactions
**Purpose:** Identify suspicious energy trading patterns

**Features:**
- Sudden spike in energy selling (possible meter tampering)
- Multiple accounts from same location
- Price manipulation (selling at 10x market rate)

**Model:** Isolation Forest (anomaly detection)

### 6.2 Energy Generation Prediction
**Purpose:** Verify claimed generation matches expected output

**Inputs:**
- Panel capacity (kW)
- Location (latitude, longitude)
- Weather data (sunlight hours, temperature)
- Historical generation

**Model:** LSTM (Time Series Prediction)

**Use Case:**
- User claims 50 kWh/day from 5 kW system
- Model predicts 25 kWh/day (based on Bangalore weather)
- Flag for review (possible meter fraud)

### 6.3 Price Recommendation System
**Purpose:** Suggest optimal pricing for sellers

**Features:**
- Time-of-day pricing (higher during evening peak)
- Location-based pricing (urban vs rural)
- Supply-demand dynamics

**Model:** Reinforcement Learning (Q-Learning)

### 6.4 User Behavior Analysis
**Purpose:** Identify fake reviews, bot accounts

**Features:**
- Review sentiment analysis (detect fake positive reviews)
- Transaction frequency patterns
- Login/activity patterns

**Model:** Random Forest Classifier

---

## 7. Legal & Compliance Considerations

### 7.1 Data Privacy
- Store documents encrypted (AES-256)
- Aadhaar masking (show only last 4 digits)
- GDPR/DPDP Act compliance (right to deletion)

### 7.2 Government Partnerships
- Approach state electricity boards for API access
- MoU with MNRE for subsidy data
- Collaborate with solar installer associations

### 7.3 Liability
- Disclaimer: Verification is best-effort, not a guarantee
- User agreement: Sellers liable for false claims
- Insurance partnership (cover fraud losses)

---

## 8. Cost Estimation

| Component | Option | Cost (per verification) |
|-----------|--------|-------------------------|
| OCR | Tesseract (free) | ₹0 |
| OCR | Google Vision API | ₹1.50 (per document) |
| AI Model Inference | TensorFlow Serving (self-hosted) | ₹0.50 (compute) |
| Storage | AWS S3 | ₹0.20 (per 10 documents) |
| Manual Review | Admin (30 min @ ₹500/hr) | ₹250 |
| **Total** | **Automated (no manual)** | **₹2-5** |
| **Total** | **With manual review** | **₹250-300** |

**Optimization:**
- Auto-approve 70% cases (pass all checks) → ₹2-5/user
- Manual review 30% cases → ₹75-90 average cost
- **Average: ₹20-30 per verification**

---

## 9. Success Metrics

- **Verification Accuracy:** 95%+ (false positive rate < 5%)
- **Processing Time:** < 24 hours for auto-approval
- **Manual Review Time:** < 2 hours per case
- **Fraud Detection Rate:** Catch 90%+ fake documents

---

## 10. Next Steps

1. **Start with Phase 1:** Build document upload system
2. **Pilot Program:** Test with 50 real sellers in Bangalore
3. **Iterate:** Improve OCR accuracy based on failure cases
4. **Scale:** Expand to other cities/states
5. **Partner:** Approach Karnataka DISCOM for API access

---

**Contact:** For implementation details, reach out to the development team.
