# Payment Integration Setup Guide

## Overview
This guide covers the complete setup of Razorpay payment integration for the Solar Sharing Platform.

---

## 1. Razorpay Account Setup

### 1.1 Create Account
1. Visit https://dashboard.razorpay.com/signup
2. Sign up with email (business email recommended)
3. Complete KYC (required for live mode)
   - Business details
   - Bank account information
   - PAN/GST documents

### 1.2 Get API Keys
1. Login to Razorpay Dashboard: https://dashboard.razorpay.com/
2. Navigate to **Settings** → **API Keys**
3. Generate Test Keys (for development)
   - **Key ID**: `rzp_test_xxxxxxxxxxxxxx`
   - **Key Secret**: `xxxxxxxxxxxxxxxxxxxxxx` (click "Generate Test Key Secret")
4. For production, activate account and generate Live Keys
   - **Key ID**: `rzp_live_xxxxxxxxxxxxxx`
   - **Key Secret**: `xxxxxxxxxxxxxxxxxxxxxx`

### 1.3 Configure Webhook
1. Go to **Settings** → **Webhooks**
2. Click **+ Add New Webhook**
3. Enter details:
   - **Webhook URL**: `https://yourdomain.com/api/v1/payment/webhook/razorpay`
   - **Alert Email**: your-email@example.com
   - **Active Events**: Select:
     - `payment.captured`
     - `payment.failed`
     - `refund.created`
     - `refund.failed`
4. Copy the **Webhook Secret**: `whsec_xxxxxxxxxxxxxx`

---

## 2. Backend Configuration

### 2.1 Install Dependencies
```bash
cd backend
npm install razorpay multer
```

### 2.2 Environment Variables
Copy `.env.example` to `.env` and update:

```env
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxx

# For production
# RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxx
# RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxx
```

### 2.3 Database Migration
Run database schema update:
```bash
npm start
# Schema will auto-create on startup
```

Or manually:
```sql
-- Check if payments table exists
SELECT * FROM pg_tables WHERE tablename = 'payments';

-- Check if solar_verifications table exists
SELECT * FROM pg_tables WHERE tablename = 'solar_verifications';
```

---

## 3. Testing Payment Flow

### 3.1 Test Card Details
Razorpay provides test cards for development:

**Successful Payment:**
- **Card Number**: 4111 1111 1111 1111
- **CVV**: Any 3 digits (e.g., 123)
- **Expiry**: Any future date (e.g., 12/25)
- **Name**: Any name

**Failed Payment:**
- **Card Number**: 4000 0000 0000 0002
- **Result**: Payment will fail

**UPI (Test Mode):**
- **UPI ID**: success@razorpay
- **Result**: Immediate success

### 3.2 API Testing with cURL

#### 3.2.1 Get Razorpay Key (Public)
```bash
curl -X GET http://localhost:3000/api/v1/payment/config/razorpay-key
```

**Response:**
```json
{
  "key_id": "rzp_test_xxxxxxxxxxxxxx"
}
```

#### 3.2.2 Create Wallet Top-up Order
```bash
curl -X POST http://localhost:3000/api/v1/payment/topup/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": 1000
  }'
```

**Response:**
```json
{
  "orderId": "order_xxxxxxxxxxxxxx",
  "amount": 1000,
  "currency": "INR",
  "key_id": "rzp_test_xxxxxxxxxxxxxx"
}
```

#### 3.2.3 Verify Payment
```bash
curl -X POST http://localhost:3000/api/v1/payment/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "razorpay_order_id": "order_xxxxxxxxxxxxxx",
    "razorpay_payment_id": "pay_xxxxxxxxxxxxxx",
    "razorpay_signature": "generated_signature_hash"
  }'
```

**Response (Success):**
```json
{
  "success": true,
  "payment": {
    "id": "uuid",
    "status": "completed",
    "amount": 1000
  }
}
```

#### 3.2.4 Get Payment History
```bash
curl -X GET "http://localhost:3000/api/v1/payment/history?limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3.2.5 Process Refund
```bash
curl -X POST http://localhost:3000/api/v1/payment/refund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "paymentId": "payment-uuid",
    "amount": 500,
    "reason": "Customer requested refund"
  }'
```

### 3.3 Webhook Testing

#### 3.3.1 Local Testing with ngrok
1. Install ngrok: https://ngrok.com/download
2. Start your server:
   ```bash
   npm run dev
   ```
3. Expose local server:
   ```bash
   ngrok http 3000
   ```
4. Copy ngrok URL (e.g., `https://abc123.ngrok.io`)
5. Update Razorpay webhook URL to: `https://abc123.ngrok.io/api/v1/payment/webhook/razorpay`

#### 3.3.2 Manual Webhook Simulation
```bash
curl -X POST http://localhost:3000/api/v1/payment/webhook/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: generated_signature" \
  -d '{
    "event": "payment.captured",
    "payload": {
      "payment": {
        "entity": {
          "id": "pay_xxxxxxxxxxxxxx",
          "order_id": "order_xxxxxxxxxxxxxx",
          "amount": 100000,
          "status": "captured"
        }
      }
    }
  }'
```

---

## 4. Frontend Integration

### 4.1 Install Razorpay Checkout
```bash
cd frontend
npm install react-native-razorpay
```

### 4.2 Example React Native Code
```typescript
import RazorpayCheckout from 'react-native-razorpay';
import { paymentService } from './services/paymentService';

const handleTopup = async () => {
  try {
    // Step 1: Create order on backend
    const { orderId, amount, currency, key_id } = await paymentService.createTopupOrder(1000);

    // Step 2: Open Razorpay Checkout
    const options = {
      key: key_id,
      amount: amount * 100, // Amount in paise
      currency: currency,
      name: 'Solar Sharing Platform',
      description: 'Wallet Top-up',
      order_id: orderId,
      prefill: {
        email: user.email,
        contact: user.phone,
        name: user.username
      },
      theme: { color: '#F37254' }
    };

    const data = await RazorpayCheckout.open(options);

    // Step 3: Verify payment on backend
    const verification = await paymentService.verifyPayment({
      razorpay_order_id: data.razorpay_order_id,
      razorpay_payment_id: data.razorpay_payment_id,
      razorpay_signature: data.razorpay_signature
    });

    if (verification.success) {
      Alert.alert('Success', 'Payment completed successfully!');
      // Refresh wallet balance
    }
  } catch (error) {
    Alert.alert('Payment Failed', error.message);
  }
};
```

### 4.3 Payment Service (TypeScript)
```typescript
// frontend/src/services/paymentService.ts
import { api } from './api';

export const paymentService = {
  async createTopupOrder(amount: number) {
    const { data } = await api.post('/payment/topup/create-order', { amount });
    return data;
  },

  async createEnergyPaymentOrder(transactionId: string, amount: number) {
    const { data } = await api.post('/payment/energy/create-order', {
      transactionId,
      amount
    });
    return data;
  },

  async verifyPayment(paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const { data } = await api.post('/payment/verify', paymentData);
    return data;
  },

  async getPaymentHistory(limit = 20, offset = 0) {
    const { data } = await api.get(`/payment/history?limit=${limit}&offset=${offset}`);
    return data;
  },

  async requestRefund(paymentId: string, amount: number, reason: string) {
    const { data } = await api.post('/payment/refund', {
      paymentId,
      amount,
      reason
    });
    return data;
  }
};
```

---

## 5. Document Verification Setup

### 5.1 Create Upload Directory
```bash
mkdir -p backend/uploads/verifications
```

### 5.2 Test Document Upload
```bash
curl -X POST http://localhost:3000/api/v1/verification/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Returns verificationId
```

```bash
curl -X POST http://localhost:3000/api/v1/verification/{verificationId}/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "document=@/path/to/electricity_bill.pdf" \
  -F "documentType=electricity_bill"
```

### 5.3 Admin Review
```bash
# Get pending verifications
curl -X GET http://localhost:3000/api/v1/verification/admin/pending \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"

# Approve verification
curl -X PUT http://localhost:3000/api/v1/verification/admin/{verificationId}/approve \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "notes": "All documents verified" }'
```

---

## 6. Production Checklist

### 6.1 Security
- [ ] Switch to Razorpay Live keys
- [ ] Enable HTTPS (SSL certificate)
- [ ] Whitelist webhook IP in firewall
- [ ] Store keys in environment variables (not in code)
- [ ] Enable rate limiting on payment endpoints
- [ ] Implement payment amount limits (min/max)
- [ ] Add fraud detection (multiple failed attempts)

### 6.2 Compliance
- [ ] Complete Razorpay KYC
- [ ] Add terms & conditions link in checkout
- [ ] Display cancellation/refund policy
- [ ] GST invoice generation (if applicable)
- [ ] PCI-DSS compliance (Razorpay handles this)

### 6.3 Monitoring
- [ ] Set up payment alerts (email/SMS)
- [ ] Monitor webhook failures
- [ ] Track refund rates
- [ ] Set up dashboard for payment analytics
- [ ] Enable Razorpay's fraud detection

### 6.4 Backup
- [ ] Daily database backups (include payments table)
- [ ] Store payment logs for 7 years (legal requirement)
- [ ] Implement reconciliation system (match Razorpay dashboard with DB)

---

## 7. Troubleshooting

### 7.1 Common Errors

#### Error: "Invalid key_id"
**Solution:** Check if `RAZORPAY_KEY_ID` in `.env` matches dashboard

#### Error: "Signature verification failed"
**Solution:** Ensure `RAZORPAY_KEY_SECRET` is correct and webhook secret is set

#### Error: "Payment amount mismatch"
**Solution:** Razorpay expects amount in paise (multiply by 100)

#### Error: "Webhook signature invalid"
**Solution:** Check `RAZORPAY_WEBHOOK_SECRET` and ensure raw body is used for verification

### 7.2 Testing in Production
1. Start with small amounts (₹1-10)
2. Test complete flow: order → payment → verification → wallet credit
3. Test failure scenarios: expired card, insufficient funds
4. Test refund flow: full and partial refunds
5. Verify webhook delivery in Razorpay dashboard

---

## 8. Cost Estimation

### Razorpay Pricing (India)
- **Domestic Payments**: 2% + GST per transaction
- **International Cards**: 3% + GST per transaction
- **UPI**: Free (first 1 crore, then 0.9%)
- **Netbanking**: 2% + GST
- **Wallet**: 2% + GST

**Example:**
- User tops up ₹1,000
- Platform fee: ₹20 (2%)
- GST on fee: ₹3.60 (18% of ₹20)
- **Total deduction**: ₹23.60
- **User receives**: ₹976.40

**Recommendation:** Pass on payment gateway fees to users or absorb in platform commission.

---

## 9. Next Steps

1. **Phase 1**: Test payment flow in development
2. **Phase 2**: Implement frontend UI (wallet screen, payment history)
3. **Phase 3**: Add payment notifications (push/email)
4. **Phase 4**: Implement auto-reconciliation
5. **Phase 5**: Switch to production keys and go live

---

## 10. Support

- **Razorpay Support**: https://razorpay.com/support/
- **Documentation**: https://razorpay.com/docs/
- **API Reference**: https://razorpay.com/docs/api/

For implementation issues, check logs at `backend/logs/` or contact the development team.
