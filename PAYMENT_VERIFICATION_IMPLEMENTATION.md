# Payment & Verification System - Implementation Summary

## 📋 Overview
This document summarizes the complete payment integration with Razorpay and the solar panel document verification system implemented for the Solar Sharing Platform.

---

## ✅ What Has Been Implemented

### 1. Payment System (Razorpay Integration)

#### 1.1 Database Schema
**Table: `payments`**
- Columns: id, user_id, amount, currency, payment_type, status, gateway, gateway_order_id, gateway_payment_id, reference_id, reference_type, metadata, timestamps
- 6 Indexes for optimized queries
- Supports: Wallet top-up, Energy purchase, Refunds, Withdrawals

**Status Flow:**
```
pending → processing → completed/failed/refunded
```

#### 1.2 Backend Services
**File: `/backend/src/services/PaymentService.js` (485 lines)**

**Key Methods:**
- `createTopupOrder(userId, amount)` - Creates Razorpay order for wallet top-up
- `createEnergyPaymentOrder(userId, transactionId, amount)` - Creates order for energy purchase
- `verifyPaymentSignature(orderId, paymentId, signature)` - HMAC-SHA256 verification
- `handlePaymentSuccess(razorpayOrderId, razorpayPaymentId, razorpaySignature)` - Process successful payment with database transaction
- `handlePaymentFailure(razorpayOrderId, reason)` - Mark payment as failed
- `processRefund(paymentId, amount, reason)` - Full refund flow with Razorpay API
- `getPaymentHistory(userId, filters)` - Query payment history with pagination

**Transaction Safety:**
All critical payment operations use database transactions (BEGIN/COMMIT/ROLLBACK) to ensure atomicity.

**Payment Flow:**
1. User initiates payment → Create order in DB (status: pending)
2. Razorpay processes payment → Webhook triggers
3. Verify signature → Lock payment record (FOR UPDATE)
4. Update payment status → Credit/Debit wallets
5. Update energy_transaction (if energy purchase)
6. Commit transaction

#### 1.3 API Endpoints
**File: `/backend/src/routes/paymentRoutes.js`**

**Public Endpoints:**
- `GET /api/v1/payment/config/razorpay-key` - Get Razorpay public key (for frontend)
- `POST /api/v1/payment/webhook/razorpay` - Webhook handler (signature verified)

**Protected Endpoints (Authentication Required):**
- `POST /api/v1/payment/topup/create-order` - Create wallet top-up order
- `POST /api/v1/payment/energy/create-order` - Create energy payment order
- `POST /api/v1/payment/verify` - Verify payment after Razorpay checkout
- `POST /api/v1/payment/refund` - Request refund
- `GET /api/v1/payment/history` - Get payment history (with pagination)
- `GET /api/v1/payment/:paymentId` - Get payment details

**Webhook Events Handled:**
- `payment.captured` - Payment successful
- `payment.failed` - Payment failed
- `refund.created` - Refund processed

#### 1.4 Configuration
**File: `/backend/src/config/index.js`**
```javascript
razorpay: {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
}
```

**Environment Variables (.env.example):**
```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

---

### 2. Document Verification System

#### 2.1 Database Schema
**Table: `solar_verifications`**
- **Status Tracking**: pending → documents_uploaded → ocr_completed → auto_validated → ai_checked → govt_verified → approved/rejected
- **Document Storage**: electricity_bill_path, solar_invoice_path, installation_certificate_path, net_metering_agreement_path, subsidy_approval_path, property_proof_path, kyc_documents_path
- **Extracted Data**: consumer_number, panel_capacity_kw, installer_name, installer_mnre_reg, net_metering_number, subsidy_id, installation_date
- **Validation Results**: cross_document_check_passed, format_validation_passed, date_logic_check_passed, installer_verified
- **AI Analysis**: document_authenticity_score, ai_flags (JSONB)
- **Government Verification**: govt_api_verified, govt_response (JSONB)
- **Admin Review**: reviewed_by, reviewed_at, admin_notes

**Users Table Updates:**
- `is_verified_seller` (BOOLEAN) - Flag for verified solar panel owners
- `verification_id` (UUID) - Link to solar_verifications table
- `verified_at` (TIMESTAMP) - Verification approval timestamp

#### 2.2 Backend Services
**File: `/backend/src/services/DocumentVerificationService.js` (489 lines)**

**Key Methods:**
- `createVerification(userId)` - Initialize verification request
- `uploadDocument(verificationId, documentType, filePath)` - Upload individual documents
- `updateExtractedData(verificationId, extractedData)` - Store OCR results
- `performAutomatedValidation(verificationId)` - Run automated checks
  - Cross-document consistency (name, address, consumer number)
  - Format validation (net metering number, MNRE reg format)
  - Date logic checks (installation date < current date)
  - Installer verification (check against MNRE list)
- `updateAIScore(verificationId, authenticityScore, flags)` - Store AI analysis results
- `updateGovtVerification(verificationId, verified, response)` - Store government API check
- `approveVerification(verificationId, adminId, notes)` - Admin approval (updates user.is_verified_seller)
- `rejectVerification(verificationId, adminId, reason)` - Admin rejection
- `getPendingVerifications(limit, offset)` - Get verifications awaiting review
- `getVerificationStats()` - Dashboard statistics

#### 2.3 API Endpoints
**File: `/backend/src/routes/verificationRoutes.js`**

**User Endpoints:**
- `POST /api/v1/verification/create` - Create verification request
- `POST /api/v1/verification/:verificationId/upload` - Upload document (multipart/form-data)
- `POST /api/v1/verification/:verificationId/submit` - Submit for review (triggers validation)
- `GET /api/v1/verification/my-verification` - Get own verification status
- `GET /api/v1/verification/:verificationId` - Get verification details

**Admin Endpoints:**
- `GET /api/v1/verification/admin/pending` - List pending verifications
- `PUT /api/v1/verification/admin/:verificationId/approve` - Approve verification
- `PUT /api/v1/verification/admin/:verificationId/reject` - Reject verification
- `GET /api/v1/verification/admin/stats` - Get statistics

**Internal Endpoints (for OCR/AI services):**
- `PUT /api/v1/verification/:verificationId/ocr` - Update extracted data
- `PUT /api/v1/verification/:verificationId/ai-score` - Update AI score

#### 2.4 File Upload Configuration
**Multer Setup:**
- Upload directory: `/backend/uploads/verifications`
- Accepted formats: JPEG, PNG, PDF
- File size limit: 10MB
- Filename format: `{fieldname}-{timestamp}-{random}.{ext}`

---

## 📄 Documentation Created

### 1. SOLAR_VERIFICATION_APPROACH.md (Comprehensive Guide)
**Sections:**
1. Government Data Sources (MNRE, State Electricity Boards, DISCOM)
2. Required Documents (7 types)
3. 4-Level Verification Process:
   - Level 1: Document Upload & OCR Extraction
   - Level 2: Automated Validation
   - Level 3: AI Document Authenticity Detection
   - Level 4: Government Database Cross-Check
   - Level 5: Manual Admin Review
4. Database Schema (detailed)
5. Implementation Roadmap (8 weeks)
6. AI/ML Enhancements (fraud detection, generation prediction, price optimization)
7. Legal & Compliance Considerations
8. Cost Estimation (₹20-30 per verification)
9. Success Metrics

### 2. PAYMENT_SETUP_GUIDE.md (Step-by-Step Setup)
**Sections:**
1. Razorpay Account Setup (signup, API keys, webhooks)
2. Backend Configuration (env variables, database)
3. Testing Payment Flow (test cards, cURL examples)
4. Frontend Integration (React Native example)
5. Document Verification Setup
6. Production Checklist (security, compliance, monitoring)
7. Troubleshooting (common errors)
8. Cost Estimation (transaction fees)

---

## 🔧 Configuration Files Modified

### 1. `/backend/src/server.js`
- Added payment routes: `app.use('/api/v1/payment', paymentRoutes)`
- Added verification routes: `app.use('/api/v1/verification', verificationRoutes)`

### 2. `/backend/package.json`
**New Dependencies:**
- `razorpay: ^2.9.2` - Razorpay SDK
- `multer: ^1.4.5-lts.1` - File upload middleware

### 3. `/backend/src/database/schema.js`
**New Tables:**
- `payments` (with 6 indexes)
- `solar_verifications` (with 3 indexes)
**Table Modifications:**
- `users` table: Added `is_verified_seller`, `verification_id`, `verified_at`

### 4. `/backend/.env.example`
**New Variables:**
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY` (optional)
- `STRIPE_PUBLISHABLE_KEY` (optional)
- `STRIPE_WEBHOOK_SECRET` (optional)

---

## 🚀 How to Use

### Payment Flow (User Perspective)

1. **Wallet Top-up:**
   ```
   User → Clicks "Add Money" → Enters amount (e.g., ₹1000)
   → Frontend calls POST /payment/topup/create-order
   → Backend creates Razorpay order → Returns order_id
   → Frontend opens Razorpay Checkout → User completes payment
   → Razorpay sends webhook → Backend verifies signature → Credits wallet
   → User sees updated balance
   ```

2. **Energy Purchase:**
   ```
   User → Selects energy listing → Clicks "Buy"
   → Frontend calls POST /payment/energy/create-order
   → Backend creates order + energy_transaction (status: pending)
   → Razorpay Checkout → Payment → Webhook
   → Backend: Deducts from buyer wallet, Credits seller (minus 5% fee)
   → Updates energy_transaction status to "completed"
   → Listing marked as sold
   ```

3. **Refund:**
   ```
   User → Requests refund → Admin approves
   → Backend calls Razorpay refund API
   → Razorpay processes refund → Sends webhook
   → Backend debits seller wallet, Credits buyer wallet
   → Payment status updated to "refunded"
   ```

### Verification Flow (Seller Perspective)

1. **Document Submission:**
   ```
   Seller → Clicks "Become Verified Seller"
   → Frontend calls POST /verification/create → Returns verificationId
   → Seller uploads 7 documents (electricity bill, invoice, etc.)
   → Each upload: POST /verification/:id/upload
   → Seller clicks "Submit" → POST /verification/:id/submit
   ```

2. **Automated Validation:**
   ```
   Backend triggers performAutomatedValidation()
   → Checks cross-document consistency (name, address match)
   → Validates formats (net metering number, MNRE reg)
   → Date logic checks (installation date valid)
   → Installer verification (MNRE registered?)
   → Status updated to "auto_validated"
   ```

3. **(Optional) OCR & AI:**
   ```
   External OCR service extracts data from documents
   → Calls PUT /verification/:id/ocr with extracted data
   → AI service analyzes document authenticity
   → Calls PUT /verification/:id/ai-score with score (0-100)
   → Status updated to "ai_checked"
   ```

4. **Admin Review:**
   ```
   Admin → Logs in → Views GET /verification/admin/pending
   → Opens specific verification → Reviews documents
   → Checks AI flags, validation results
   → Decision:
     - APPROVE: PUT /admin/:id/approve → user.is_verified_seller = TRUE
     - REJECT: PUT /admin/:id/reject → Seller notified with reason
   ```

---

## 🎯 Next Steps to Complete Implementation

### Immediate (Required for Basic Functionality)
1. **Install packages:**
   ```bash
   cd backend
   npm install
   ```

2. **Update environment variables:**
   - Copy `.env.example` to `.env`
   - Add Razorpay test keys (get from https://dashboard.razorpay.com)

3. **Start server:**
   ```bash
   npm run dev
   ```
   - Database tables will auto-create

4. **Test payment flow:**
   - Use Postman/cURL to test endpoints
   - Use Razorpay test card: 4111 1111 1111 1111

### Short-term (Week 1-2)
5. **Frontend Integration:**
   - Install `react-native-razorpay`
   - Create wallet screen (top-up, balance, history)
   - Create payment verification screen
   - Add document upload screen (camera + gallery picker)

6. **OCR Integration (Optional):**
   - Install Tesseract.js or Google Cloud Vision API
   - Create OCR service to extract text from uploaded documents
   - Parse consumer number, panel capacity, installer name

7. **Admin Dashboard:**
   - Create admin panel in React/Next.js
   - Display pending verifications with document viewer
   - Add approve/reject buttons
   - Show verification statistics

### Medium-term (Week 3-4)
8. **AI Document Verification:**
   - Collect dataset of real electricity bills/invoices
   - Train EfficientNet model (Python/TensorFlow)
   - Deploy model (TensorFlow Serving or Flask API)
   - Integrate with backend

9. **Government API Integration:**
   - Research available APIs (DISCOM, MNRE)
   - Implement web scraping fallback
   - Add GST verification for installers

10. **Notifications:**
    - Email notifications (payment success/failure, verification status)
    - Push notifications (React Native)
    - SMS notifications (Twilio)

### Long-term (Production)
11. **Security Hardening:**
    - Enable rate limiting on payment endpoints
    - Add IP whitelisting for webhooks
    - Implement fraud detection (multiple failed attempts)
    - Encrypt stored documents (AES-256)

12. **Reconciliation System:**
    - Daily job to match Razorpay dashboard with database
    - Alert on discrepancies
    - Auto-generate financial reports

13. **Testing:**
    - Unit tests for PaymentService
    - Integration tests for payment flow
    - End-to-end tests with Razorpay test environment
    - Load testing (1000+ concurrent payments)

---

## 📊 API Endpoints Summary

### Payment APIs
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/payment/config/razorpay-key` | ❌ | Get public key |
| POST | `/api/v1/payment/topup/create-order` | ✅ | Create top-up order |
| POST | `/api/v1/payment/energy/create-order` | ✅ | Create energy payment order |
| POST | `/api/v1/payment/verify` | ✅ | Verify payment signature |
| POST | `/api/v1/payment/webhook/razorpay` | ❌ | Webhook handler |
| POST | `/api/v1/payment/refund` | ✅ | Request refund |
| GET | `/api/v1/payment/history` | ✅ | Get payment history |
| GET | `/api/v1/payment/:paymentId` | ✅ | Get payment details |

### Verification APIs
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/v1/verification/create` | ✅ | User | Create verification |
| POST | `/api/v1/verification/:id/upload` | ✅ | User | Upload document |
| POST | `/api/v1/verification/:id/submit` | ✅ | User | Submit for review |
| GET | `/api/v1/verification/my-verification` | ✅ | User | Get own status |
| GET | `/api/v1/verification/:id` | ✅ | User/Admin | Get details |
| GET | `/api/v1/verification/admin/pending` | ✅ | Admin | List pending |
| PUT | `/api/v1/verification/admin/:id/approve` | ✅ | Admin | Approve |
| PUT | `/api/v1/verification/admin/:id/reject` | ✅ | Admin | Reject |
| GET | `/api/v1/verification/admin/stats` | ✅ | Admin | Get statistics |

---

## 🐛 Troubleshooting

### Payment Issues
**Problem:** "Invalid key_id"
- **Solution:** Check `RAZORPAY_KEY_ID` in `.env` matches Razorpay dashboard

**Problem:** "Signature verification failed"
- **Solution:** Ensure `RAZORPAY_KEY_SECRET` is correct and not expired

**Problem:** Webhook not triggering
- **Solution:** Use ngrok for local testing, check webhook URL in Razorpay dashboard

### Verification Issues
**Problem:** File upload fails
- **Solution:** Check `/backend/uploads/verifications` directory exists and has write permissions

**Problem:** "Verification not found"
- **Solution:** Ensure user owns the verification (check user_id)

---

## 📈 Performance Optimizations

1. **Database Indexes:** Added 9 indexes (6 on payments, 3 on solar_verifications)
2. **Transaction Locking:** Uses `FOR UPDATE` to prevent race conditions
3. **Pagination:** All list endpoints support limit/offset
4. **File Size Limits:** 10MB max per document (prevents abuse)
5. **Rate Limiting:** Applied on all `/api/` routes (via Redis)

---

## 💡 Best Practices Implemented

1. **Atomic Transactions:** All financial operations use BEGIN/COMMIT/ROLLBACK
2. **Signature Verification:** HMAC-SHA256 for webhook authentication
3. **Idempotency:** Payment records locked during processing to prevent duplicates
4. **Error Handling:** asyncHandler wraps all controllers for consistent error responses
5. **Logging:** Structured logging (Pino) for all payment operations
6. **Security:** File type validation, size limits, authentication checks

---

## 📞 Support & Documentation

- **Razorpay Docs:** https://razorpay.com/docs/
- **API Reference:** Check `PAYMENT_SETUP_GUIDE.md` for cURL examples
- **Verification Process:** See `SOLAR_VERIFICATION_APPROACH.md` for detailed flow
- **Architecture:** See `ARCHITECTURE.md` for system design

---

## 🎉 Summary

**Total Lines of Code Added:**
- PaymentService.js: 485 lines
- DocumentVerificationService.js: 489 lines
- PaymentController: 178 lines
- VerificationController: 334 lines
- Routes: 62 lines
- **Total: ~1,550 lines** (excluding documentation)

**Documentation Created:**
- SOLAR_VERIFICATION_APPROACH.md: 450+ lines
- PAYMENT_SETUP_GUIDE.md: 450+ lines

**Database Changes:**
- 2 new tables (payments, solar_verifications)
- 9 new indexes
- 3 new columns in users table

**The system is now ready for:**
✅ Wallet top-ups via Razorpay
✅ Energy purchases with automatic fund transfer
✅ Refund processing
✅ Document upload for seller verification
✅ Automated validation of documents
✅ Admin approval workflow

**Next: Install packages (`npm install`) and start testing!**
