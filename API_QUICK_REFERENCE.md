# 📋 API Quick Reference Card

## Response Format Template

Use this in your frontend/client code:

```javascript
// Success handling
if (response.success) {
  const data = response.data;
  const message = response.message;
  // Handle success
}

// Error handling
if (!response.success) {
  const errorType = response.error;
  const message = response.message;
  const details = response.details;
  // Handle error based on statusCode
  switch(response.statusCode) {
    case 400: // Validation error
      break;
    case 401: // Auth error
      break;
    case 403: // Permission error
      break;
    case 404: // Not found
      break;
    case 429: // Rate limit
      break;
    default: // Server error
  }
}
```

## React Native/JavaScript Client Example

```javascript
// API Service
class ApiClient {
  constructor(baseURL = 'http://localhost:3000/api/v1') {
    this.baseURL = baseURL;
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Register user
  async register(userData) {
    try {
      const response = await fetch(`${this.baseURL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.accessToken = data.data.accessToken;
        this.refreshToken = data.data.refreshToken;
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  // Login
  async login(email, password) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      this.accessToken = data.data.accessToken;
      this.refreshToken = data.data.refreshToken;
      return data.data;
    } else {
      throw new Error(data.message);
    }
  }

  // Get user profile (protected)
  async getProfile() {
    const response = await fetch(`${this.baseURL}/users/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
    
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else if (response.status === 401) {
      // Token expired, refresh
      await this.refreshAccessToken();
      return this.getProfile(); // Retry
    } else {
      throw new Error(data.message);
    }
  }

  // Refresh token
  async refreshAccessToken() {
    const response = await fetch(`${this.baseURL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      this.accessToken = data.data.accessToken;
      this.refreshToken = data.data.refreshToken;
    } else {
      // Refresh token expired, logout
      this.logout();
      throw new Error('Session expired');
    }
  }

  // Logout
  logout() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Generic request method
  async request(method, endpoint, body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (this.accessToken) {
      options.headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, options);
    const data = await response.json();

    if (!data.success && response.status === 401) {
      // Auto-refresh on 401
      await this.refreshAccessToken();
      return this.request(method, endpoint, body);
    }

    return data;
  }
}

// Usage
const api = new ApiClient();

// Register
await api.register({
  email: 'user@example.com',
  password: 'Password@123456',
  fullName: 'John Doe',
  phone: '+918888888888',
  address: '123 Solar Street',
  city: 'New Delhi',
  state: 'Delhi',
  pincode: '110001',
  role: 'buyer',
});

// Login
await api.login('user@example.com', 'Password@123456');

// Get profile
const profile = await api.getProfile();
console.log(profile);

// Other requests
const wallet = await api.request('GET', '/wallet');
const transactions = await api.request('GET', '/transactions?page=1&limit=10');
```

## cURL Cheat Sheet

```bash
# Set token variable
TOKEN="your_access_token_here"
BASE_URL="http://localhost:3000/api/v1"

# GET requests
curl -H "Authorization: Bearer $TOKEN" $BASE_URL/users/profile

# POST requests
curl -X POST $BASE_URL/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"pass"}'

# PUT requests
curl -X PUT $BASE_URL/users/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"New Name"}'

# Pretty print response
curl ... | jq '.'

# Save response to variable
response=$(curl -s ...)
echo $response | jq '.data'

# Extract token from response
TOKEN=$(curl -s ... | jq -r '.data.accessToken')

# Check status code only
curl -s -o /dev/null -w "%{http_code}" $BASE_URL/health
```

## Common Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Success |
| 201 | Created | Resource created |
| 400 | Bad Request | Fix input data |
| 401 | Unauthorized | Get new token |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Wrong endpoint |
| 429 | Rate Limited | Wait before retry |
| 500 | Server Error | Contact support |

## Authentication Headers

```bash
# All protected endpoints require:
Authorization: Bearer <ACCESS_TOKEN>

# Example with curl:
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:3000/api/v1/users/profile
```

## Request Body Examples

### Register
```json
{
  "email": "user@example.com",
  "password": "SecurePass@123",
  "fullName": "John Doe",
  "phone": "+918888888888",
  "address": "123 Solar Street",
  "city": "New Delhi",
  "state": "Delhi",
  "pincode": "110001",
  "role": "buyer|host|investor"
}
```

### Login
```json
{
  "email": "user@example.com",
  "password": "SecurePass@123"
}
```

### Update Profile
```json
{
  "fullName": "Jane Doe",
  "city": "Bangalore",
  "state": "Karnataka"
}
```

### Ingest IoT Data
```json
{
  "deviceId": "solar_panel_001",
  "timestamp": "2024-01-03T10:00:00Z",
  "data": {
    "power": 4.5,
    "voltage": 230,
    "current": 19.5,
    "battery_soc": 85,
    "temperature": 35
  }
}
```

### Wallet Top-up
```json
{
  "amount": 1000,
  "paymentMethod": "razorpay"
}
```

### Withdrawal Request
```json
{
  "amount": 500,
  "bankAccount": "1234567890",
  "ifscCode": "SBIN0001234"
}
```

## Error Response Examples

### Validation Error
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

### Authentication Error
```json
{
  "success": false,
  "statusCode": 401,
  "error": "AuthenticationError",
  "message": "Invalid token",
  "timestamp": "2024-01-03T10:00:00.000Z"
}
```

### Rate Limit Error
```json
{
  "success": false,
  "statusCode": 429,
  "error": "RateLimitError",
  "message": "Too many requests, please try again later",
  "timestamp": "2024-01-03T10:00:00.000Z"
}
```

## Testing Tools

### Run All Tests
```bash
bash test-api.sh
```

### Single Request
```bash
curl -X GET http://localhost:3000/health | jq '.'
```

### Chain Requests
```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"pass"}' | jq -r '.data.accessToken')

# Use token
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/users/profile
```

## Environment Variables

```bash
# .env file
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=solar_sharing
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_secret_key
JWT_REFRESH_SECRET=your_refresh_secret

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883

# External APIs
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
```

## Debugging

### Enable Verbose Output
```bash
# Detailed curl output
curl -v http://localhost:3000/health

# With timing
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health
```

### Monitor Logs
```bash
# Terminal 1: Run backend
npm run dev

# Terminal 2: Watch for errors
tail -f logs/error.log
```

### Test Database
```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d solar_sharing

# Query users
SELECT id, email, role FROM users;

# Query transactions
SELECT * FROM transactions LIMIT 10;
```

## Performance Tips

1. **Token Caching**: Store token locally, refresh when needed
2. **Pagination**: Use limit parameter to reduce data transfer
3. **Batching**: Combine multiple requests when possible
4. **Caching**: Use response caching for read-heavy operations
5. **Compression**: Backend automatically compresses responses

## Rate Limits

- **Users**: 100 requests/minute
- **Devices**: 10 requests/minute
- **Admin**: 1000 requests/minute

If rate limited (429), wait and retry.

## Testing Workflow

1. Start backend: `npm run dev`
2. Run tests: `bash test-api.sh`
3. Check logs in terminal
4. Verify database: `psql`
5. Adjust as needed
6. Commit working code

## Resources

- **Full API Docs**: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Setup Guide**: [SETUP_GUIDE.md](./SETUP_GUIDE.md)
- **Testing Guide**: [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md)
- **Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)
