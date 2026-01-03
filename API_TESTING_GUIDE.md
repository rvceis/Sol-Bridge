# 🧪 API Testing Guide

## Overview

The Solar Sharing Platform includes comprehensive API testing capabilities:
- **Automated Test Script**: `test-api.sh` - Tests all 17 endpoints with color-coded output
- **Standard Response Format**: Consistent JSON responses for all endpoints
- **Enhanced Error Logging**: Detailed error context and request tracking
- **Batch Test Commands**: Copy-paste ready curl commands

---

## Quick Start

### 1. Run Automated Test Script

```bash
# Navigate to backend directory
cd /home/akash/Desktop/SOlar_Sharing/backend

# Run with defaults (localhost:3000, test email/password)
bash test-api.sh

# Run with custom parameters
bash test-api.sh http://your-server:3000/api/v1 user@example.com MyPassword123
```

### 2. Run Backend Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Server will run on http://localhost:3000
# API endpoints: http://localhost:3000/api/v1
```

### 3. Check Health

```bash
# Quick health check
curl http://localhost:3000/health | jq '.'

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-03T10:00:00.000Z",
  "uptime": 125.432
}
```

---

## Standard Response Format

All API responses follow a consistent format for easy handling:

### Success Response (2xx)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success message",
  "data": {
    "id": "user123",
    "email": "user@example.com"
  },
  "timestamp": "2024-01-03T10:00:00.000Z"
}
```

### Error Response (4xx, 5xx)

```json
{
  "success": false,
  "statusCode": 400,
  "error": "ValidationError",
  "message": "Email is required",
  "details": [
    {
      "path": "email",
      "message": "Email is required"
    }
  ],
  "timestamp": "2024-01-03T10:00:00.000Z"
}
```

### Paginated Response

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": [
    { "id": 1, "amount": 100 },
    { "id": 2, "amount": 200 }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "pages": 5
  },
  "timestamp": "2024-01-03T10:00:00.000Z"
}
```

---

## Error Handling

The API provides detailed error information:

### Common Error Codes

| Status | Error Type | Meaning |
|--------|-----------|---------|
| 400 | ValidationError | Invalid input data |
| 401 | AuthenticationError | Missing/invalid token |
| 403 | AuthorizationError | Insufficient permissions |
| 404 | NotFoundError | Resource not found |
| 409 | ConflictError | Resource already exists |
| 429 | RateLimitError | Too many requests |
| 500 | InternalServerError | Server error |

### Example Error Responses

**Validation Error:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "invalid-email",
    "password": "short"
  }' | jq '.'
```

Response:
```json
{
  "success": false,
  "statusCode": 400,
  "error": "ValidationError",
  "message": "\"email\" must be a valid email",
  "details": [
    {
      "path": "email",
      "message": "\"email\" must be a valid email"
    }
  ],
  "timestamp": "2024-01-03T10:00:00.000Z"
}
```

**Authentication Error:**
```bash
curl -X GET http://localhost:3000/api/v1/users/profile \
  -H 'Authorization: Bearer invalid_token' | jq '.'
```

Response:
```json
{
  "success": false,
  "statusCode": 401,
  "error": "AuthenticationError",
  "message": "Invalid token",
  "timestamp": "2024-01-03T10:00:00.000Z"
}
```

---

## Testing All 17 Endpoints

### Authentication Endpoints (6)

#### 1. Register User
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "Password@123456",
    "fullName": "John Doe",
    "phone": "+918888888888",
    "address": "123 Solar Street",
    "city": "New Delhi",
    "state": "Delhi",
    "pincode": "110001",
    "role": "buyer"
  }' | jq '.'
```

#### 2. Login User
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "Password@123456"
  }' | jq '.'
```

**Save tokens from response:**
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export REFRESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### 3. Verify Email
```bash
# Get token from email
curl -X GET "http://localhost:3000/api/v1/auth/verify-email?token=YOUR_VERIFICATION_TOKEN" | jq '.'
```

#### 4. Request Password Reset
```bash
curl -X POST http://localhost:3000/api/v1/auth/password-reset-request \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com"}' | jq '.'
```

#### 5. Reset Password
```bash
curl -X POST http://localhost:3000/api/v1/auth/password-reset \
  -H 'Content-Type: application/json' \
  -d '{
    "token": "RESET_TOKEN_FROM_EMAIL",
    "newPassword": "NewPassword@123456"
  }' | jq '.'
```

#### 6. Refresh Token
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh-token \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken": "'$REFRESH_TOKEN'"}' | jq '.'
```

---

### User Profile Endpoints (2)

#### 7. Get User Profile
```bash
curl -X GET http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

#### 8. Update User Profile
```bash
curl -X PUT http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "fullName": "John Updated",
    "city": "Bangalore",
    "state": "Karnataka"
  }' | jq '.'
```

---

### IoT Data Endpoints (4)

#### 9. Register IoT Device
```bash
curl -X POST http://localhost:3000/api/v1/iot/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "solar_panel_001",
    "deviceType": "solar_panel",
    "location": "Roof",
    "latitude": 28.7041,
    "longitude": 77.1025,
    "capacity": 5.0
  }' | jq '.'
```

#### 10. Ingest IoT Data
```bash
curl -X POST http://localhost:3000/api/v1/iot/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "solar_panel_001",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "data": {
      "power": 4.5,
      "voltage": 230,
      "current": 19.5,
      "battery_soc": 85,
      "temperature": 35
    }
  }' | jq '.'
```

#### 11. Get Latest Reading
```bash
curl -X GET http://localhost:3000/api/v1/iot/latest/USER_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

#### 12. Get Reading History
```bash
# Get readings from last 24 hours
curl -X GET "http://localhost:3000/api/v1/iot/history/USER_ID?from=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)&to=$(date -u +%Y-%m-%dT%H:%M:%SZ)&resolution=15min" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

---

### Wallet & Transaction Endpoints (6)

#### 13. Get Wallet Balance
```bash
curl -X GET http://localhost:3000/api/v1/wallet \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

#### 14. Get Transaction History
```bash
curl -X GET "http://localhost:3000/api/v1/transactions?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

#### 15. Wallet Top-up
```bash
curl -X POST http://localhost:3000/api/v1/wallet/topup \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 1000,
    "paymentMethod": "razorpay"
  }' | jq '.'
```

#### 16. Request Withdrawal
```bash
curl -X POST http://localhost:3000/api/v1/wallet/withdraw \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "amount": 500,
    "bankAccount": "1234567890",
    "ifscCode": "SBIN0001234"
  }' | jq '.'
```

#### 17. Payment Callback (Webhook)
```bash
curl -X POST http://localhost:3000/api/v1/payment/callback \
  -H 'Content-Type: application/json' \
  -d '{
    "transactionId": "txn_123456789",
    "orderId": "order_123",
    "status": "success",
    "amount": 1000,
    "razorpay_payment_id": "pay_123456789",
    "razorpay_order_id": "order_123",
    "razorpay_signature": "signature_hash"
  }' | jq '.'
```

#### 18. Platform Metrics (Bonus)
```bash
curl -X GET http://localhost:3000/api/v1/admin/metrics \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

---

## Advanced Testing

### Testing with Authentication

```bash
# Save token to environment variable
export TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"Password@123456"}' | jq -r '.data.accessToken')

# Use token in subsequent requests
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/users/profile | jq '.'
```

### Testing Pagination

```bash
# Get page 2 with custom limit
curl -X GET "http://localhost:3000/api/v1/transactions?page=2&limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Response includes pagination info
# {
#   "pagination": {
#     "page": 2,
#     "limit": 20,
#     "total": 150,
#     "pages": 8
#   }
# }
```

### Testing Filters

```bash
# Get readings with time range
curl -X GET "http://localhost:3000/api/v1/iot/history/USER_ID?from=2024-01-01T00:00:00Z&to=2024-01-03T23:59:59Z&resolution=daily" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### Rate Limiting Test

```bash
# Make 5 requests rapidly
for i in {1..5}; do
  curl -s http://localhost:3000/health | jq '.' &
done
wait

# After ~100 requests per minute, you'll get:
# {
#   "success": false,
#   "statusCode": 429,
#   "error": "RateLimitError",
#   "message": "Too many requests, please try again later"
# }
```

---

## Error Logging

All errors are logged with context:

### Log Example
```json
{
  "requestId": "req_123",
  "timestamp": "2024-01-03T10:00:00Z",
  "statusCode": 400,
  "errorType": "ValidationError",
  "message": "Email is required",
  "method": "POST",
  "path": "/api/v1/auth/register",
  "userId": "anonymous",
  "query": {},
  "body": {
    "password": "***REDACTED***",
    "email": ""
  },
  "ip": "127.0.0.1",
  "userAgent": "curl/7.68.0",
  "details": [
    {
      "path": "email",
      "message": "Email is required"
    }
  ]
}
```

### View Logs
```bash
# Check server logs in terminal where backend is running
npm run dev

# Logs will show:
# - Request details
# - Response status
# - Errors with full context
# - Execution time
```

---

## Postman Collection

You can also test using Postman. Create requests with:

**Base URL:** `http://localhost:3000/api/v1`

**Headers (for protected endpoints):**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

### Import Environment Variables in Postman:

```json
{
  "BASE_URL": "http://localhost:3000/api/v1",
  "TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "REFRESH_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "USER_ID": "uuid-here",
  "DEVICE_ID": "solar_panel_001"
}
```

---

## Common Issues & Solutions

### Issue: 401 Unauthorized

**Cause:** Missing or invalid token

**Solution:**
```bash
# Get new token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"Password@123456"}' | jq '.data.accessToken'

# Use in requests
curl -H "Authorization: Bearer $(TOKEN)" http://localhost:3000/api/v1/users/profile
```

### Issue: 400 Bad Request

**Cause:** Invalid request data

**Solution:**
```bash
# Check required fields
# Use jq to validate JSON
echo '{"email":"test@test.com"}' | jq '.'

# Validate against schema
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@test.com",
    "password": "ValidPass@123",
    "fullName": "Test User",
    "phone": "+918888888888",
    "address": "123 St",
    "city": "Delhi",
    "state": "Delhi",
    "pincode": "110001",
    "role": "buyer"
  }'
```

### Issue: 429 Rate Limit

**Cause:** Too many requests

**Solution:**
```bash
# Wait before making more requests
# Or use a different IP
# Current limits: 100 req/min per user
sleep 60
```

### Issue: Connection Refused

**Cause:** Backend not running

**Solution:**
```bash
# Start backend
npm run dev

# Verify running
curl http://localhost:3000/health
```

---

## Performance Testing

### Load Testing with Apache Bench

```bash
# Install Apache Bench (if not installed)
sudo apt-get install apache2-utils

# Test health endpoint (100 requests, 10 concurrent)
ab -n 100 -c 10 http://localhost:3000/health

# Results show:
# - Requests per second
# - Time per request
# - Failed requests
```

### Stress Testing

```bash
# Make many requests and measure response time
for i in {1..1000}; do
  time curl -s http://localhost:3000/health > /dev/null
done
```

---

## Debugging

### Enable Detailed Logging

Set in `.env`:
```
NODE_ENV=development
LOG_LEVEL=debug
```

### View Full Request/Response

```bash
# Verbose curl output
curl -v -X GET http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN"

# Shows:
# - Request headers
# - Response headers
# - Response body
# - Timing information
```

### Database Query Logs

Slow queries (>1s) are logged automatically:
```json
{
  "type": "SLOW_QUERY",
  "query": "SELECT * FROM users WHERE...",
  "duration": 1250,
  "timestamp": "2024-01-03T10:00:00Z"
}
```

---

## Summary

✅ **Complete API Testing Setup:**
- Automated test script (test-api.sh)
- Standard response format
- Enhanced error logging
- 18 copy-paste ready endpoints
- Debugging tools and guides

✅ **Test All 17 Endpoints:**
- 6 authentication endpoints
- 2 user profile endpoints
- 4 IoT data endpoints
- 5 wallet & transaction endpoints
- 1 platform metrics endpoint

✅ **Error Handling:**
- 7 error types
- Detailed error context
- Sensitive data redaction
- Request tracking

Run: `bash test-api.sh` to test everything!
