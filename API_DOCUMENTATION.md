# API Documentation

## Base URL
```
http://localhost:3000/api/v1
```

## Authentication
All protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Authentication Endpoints

### 1. Register User

**POST** `/auth/register`

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "role": "host",
  "full_name": "John Doe",
  "phone": "+919876543210",
  "profile": {
    "solar_capacity_kw": 5.0,
    "installation_date": "2023-06-15",
    "location": {
      "lat": 12.9716,
      "lon": 77.5946
    },
    "address": "123 Main St",
    "city": "Bangalore",
    "state": "Karnataka",
    "pincode": "560001"
  }
}
```

**Response (201 Created):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "message": "Registration successful. Please check email for verification link."
}
```

**Roles:** `host`, `buyer`, `investor`

---

### 2. Login

**POST** `/auth/login`

Authenticate user and get tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "refresh-token-here",
  "expiresIn": 86400,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "role": "host",
    "full_name": "John Doe"
  }
}
```

---

### 3. Verify Email

**GET** `/auth/verify-email?token=<verification_token>`

Verify user email address.

**Response (200 OK):**
```json
{
  "message": "Email verified successfully"
}
```

---

### 4. Request Password Reset

**POST** `/auth/password-reset-request`

Request password reset link.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "If email exists, password reset link sent"
}
```

---

### 5. Reset Password

**POST** `/auth/password-reset`

Reset password using token from email.

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecureP@ss123"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successful"
}
```

---

### 6. Refresh Access Token

**POST** `/auth/refresh-token`

Get new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh-token-value"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "new-access-token",
  "expiresIn": 86400
}
```

---

## User Profile Endpoints

### 7. Get Profile

**GET** `/users/profile`

Get logged-in user's profile (Protected).

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "full_name": "John Doe",
  "phone": "+919876543210",
  "role": "host",
  "is_verified": true,
  "kyc_status": "verified",
  "wallet_balance": 1250.50,
  "created_at": "2025-06-15T10:00:00Z",
  "profile": {
    "solar_capacity_kw": 5.0,
    "installation_date": "2023-06-15",
    "has_battery": false,
    "location": {
      "lat": 12.9716,
      "lon": 77.5946
    },
    "meter_id": "SM_H123_001"
  }
}
```

---

### 8. Update Profile

**PUT** `/users/profile`

Update user profile (Protected).

**Request Body (partial update):**
```json
{
  "full_name": "Jane Doe",
  "phone": "+919876543211",
  "profile": {
    "solar_capacity_kw": 6.0,
    "has_battery": true,
    "battery_capacity_kwh": 10.0
  }
}
```

**Response (200 OK):**
```json
{
  "message": "Profile updated successfully",
  "user": { ... updated profile ... }
}
```

---

## IoT Data Endpoints

### 9. Ingest IoT Data

**POST** `/iot/ingest`

Send energy data from IoT device.

**Request Body:**
```json
{
  "device_id": "SM_H123_001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-15T14:30:00Z",
  "measurements": {
    "power_kw": 3.52,
    "energy_kwh": 45.18,
    "voltage": 230.5,
    "current": 15.3,
    "frequency": 50.01,
    "power_factor": 0.98
  },
  "device_status": {
    "signal_strength": -45,
    "battery_percent": 85
  }
}
```

**Response (200 OK):**
```json
{
  "status": "accepted",
  "timestamp": "2026-01-15T14:30:05Z"
}
```

**Error Response (400 Bad Request):**
```json
{
  "status": "rejected",
  "error": "validation_error",
  "message": "Power value out of range",
  "details": {
    "field": "power_kw",
    "value": 15.5,
    "max_allowed": 6.0
  }
}
```

---

### 10. Get Latest Reading

**GET** `/iot/latest/:userId`

Get latest sensor reading for user (Protected).

**Response (200 OK):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "SM_H123_001",
  "timestamp": "2026-01-15T14:30:00Z",
  "measurement_type": "solar",
  "power_kw": 3.52,
  "energy_kwh": 45.18,
  "voltage": 230.5,
  "current": 15.3
}
```

---

### 11. Get Reading History

**GET** `/iot/history/:userId?start=2026-01-01&end=2026-01-15&resolution=hourly&limit=100`

Get historical energy readings (Protected).

**Query Parameters:**
- `start` (required): Start date (ISO 8601)
- `end` (required): End date (ISO 8601)
- `resolution`: `15min`, `hourly`, `daily` (default: hourly)
- `limit`: Max results (default: 1000)

**Response (200 OK):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "start": "2026-01-01T00:00:00Z",
  "end": "2026-01-15T23:59:59Z",
  "resolution": "hourly",
  "data": [
    {
      "time": "2026-01-15T14:00:00Z",
      "avg_power": 3.45,
      "max_power": 4.12,
      "min_power": 2.87,
      "total_energy": 3.45
    }
  ]
}
```

---

### 12. Send Command to Device

**POST** `/iot/devices/:deviceId/command`

Send command to IoT device (Protected).

**Request Body:**
```json
{
  "command": "update_frequency",
  "value": 30
}
```

**Response (200 OK):**
```json
{
  "status": "sent",
  "device_id": "SM_H123_001",
  "command": "update_frequency",
  "value": 30
}
```

---

## Wallet & Transaction Endpoints

### 13. Get Wallet Balance

**GET** `/wallet`

Get user's wallet balance (Protected).

**Response (200 OK):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "balance": 1250.50,
  "currency": "INR",
  "last_transaction_at": "2026-01-15T14:30:00Z"
}
```

---

### 14. Get Transaction History

**GET** `/transactions?limit=100&offset=0`

Get user's transaction history (Protected).

**Query Parameters:**
- `limit`: Max results (default: 100)
- `offset`: Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "transactions": [
    {
      "id": "tx-123",
      "transaction_type": "energy_sale",
      "amount": 125.50,
      "description": "Energy sale: 25 kWh",
      "status": "completed",
      "created_at": "2026-01-15T14:30:00Z",
      "balance_after": 1250.50
    }
  ],
  "limit": 100,
  "offset": 0
}
```

---

### 15. Top-up Wallet

**POST** `/wallet/topup`

Initiate wallet top-up via payment gateway (Protected).

**Request Body:**
```json
{
  "amount": 500,
  "paymentMethod": "upi"
}
```

**Response (200 OK):**
```json
{
  "status": "payment_initiated",
  "amount": 500,
  "paymentMethod": "upi",
  "message": "Redirect to payment gateway",
  "paymentUrl": "https://razorpay.com/i/..."
}
```

---

### 16. Request Withdrawal

**POST** `/wallet/withdraw`

Request withdrawal to bank account (Protected).

**Request Body:**
```json
{
  "amount": 1000,
  "bankAccount": {
    "account_number": "****5678",
    "ifsc_code": "SBIN0001234",
    "last4": "5678"
  }
}
```

**Response (200 OK):**
```json
{
  "status": "withdrawal_initiated",
  "message": "Withdrawal request submitted",
  "withdrawal": {
    "transactionId": "wd-123",
    "withdrawalAmount": 1000,
    "fee": 10,
    "netAmount": 990,
    "status": "pending",
    "timestamp": "2026-01-15T14:30:00Z"
  }
}
```

---

### 17. Get Platform Metrics

**GET** `/admin/metrics?startDate=2026-01-01&endDate=2026-01-31`

Get platform metrics (Protected, Admin only).

**Query Parameters:**
- `startDate`: Start date (ISO 8601)
- `endDate`: End date (ISO 8601)

**Response (200 OK):**
```json
{
  "unique_users": 1250,
  "total_volume": 125000.50,
  "average_transaction": 100.00,
  "transaction_count": 1250
}
```

---

## Error Responses

### Validation Error (400)
```json
{
  "error": "ValidationError",
  "message": "Email already registered",
  "details": {
    "field": "email",
    "constraint": "unique"
  }
}
```

### Authentication Error (401)
```json
{
  "error": "AuthenticationError",
  "message": "Invalid or expired token"
}
```

### Authorization Error (403)
```json
{
  "error": "AuthorizationError",
  "message": "Insufficient permissions"
}
```

### Not Found (404)
```json
{
  "error": "NotFoundError",
  "message": "Resource not found"
}
```

### Rate Limit (429)
```json
{
  "error": "RateLimitError",
  "message": "Too many requests",
  "retryAfter": 60
}
```

### Server Error (500)
```json
{
  "error": "InternalServerError",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

Rate limits apply per user per endpoint per minute:
- Regular users: 100 requests/minute
- IoT devices: 10 requests/minute
- Admin users: 1000 requests/minute

Response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
Retry-After: 60
```

---

## Pagination

For endpoints returning lists, use:
- `limit`: Number of items (default: 100, max: 1000)
- `offset`: Pagination offset (default: 0)

Example: `/transactions?limit=50&offset=100`

---

## Status Codes Summary

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created |
| 204 | No Content - Success, no body |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Server Error - Internal error |

---

## Example Workflow

### 1. User Registration & Login
```bash
# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecureP@ss123",...}'

# Verify email (check email for link)
curl "http://localhost:3000/api/v1/auth/verify-email?token=..."

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecureP@ss123"}'

# Response: { accessToken, refreshToken }
```

### 2. IoT Device Onboarding
```bash
# Send first reading
curl -X POST http://localhost:3000/api/v1/iot/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"SM_H123_001",
    "user_id":"550e8400-...",
    "timestamp":"2026-01-15T14:30:00Z",
    "measurements":{"power_kw":3.52,...}
  }'
```

### 3. Get Energy Data
```bash
# Get latest reading
curl -H "Authorization: Bearer <accessToken>" \
  http://localhost:3000/api/v1/iot/latest/550e8400-...

# Get historical data
curl -H "Authorization: Bearer <accessToken>" \
  'http://localhost:3000/api/v1/iot/history/550e8400-...?start=2026-01-01&end=2026-01-15'
```

### 4. Wallet Operations
```bash
# Check balance
curl -H "Authorization: Bearer <accessToken>" \
  http://localhost:3000/api/v1/wallet

# Top-up wallet
curl -X POST -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"amount":500,"paymentMethod":"upi"}' \
  http://localhost:3000/api/v1/wallet/topup
```
