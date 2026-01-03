# Complete Setup Guide - Solar Sharing Platform Backend

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Architecture Overview](#architecture-overview)
4. [Project Structure](#project-structure)
5. [Services Implemented](#services-implemented)
6. [Next Steps](#next-steps)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements
- Linux/macOS/Windows (WSL2 for Windows)
- Node.js 18+ ([Download](https://nodejs.org))
- npm 9+ (included with Node.js)
- Docker Desktop ([Download](https://www.docker.com/products/docker-desktop))
- Git

### Verify Installation
```bash
node --version    # v18.0.0 or higher
npm --version     # 9.0.0 or higher
docker --version  # Docker version 20+
```

---

## Quick Start

### Step 1: Clone Repository
```bash
# Clone the repository
git clone https://github.com/yourusername/solar-sharing-platform.git
cd solar-sharing-platform/backend

# Install dependencies
npm install
```

### Step 2: Configure Environment
```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings (for local dev, defaults are fine)
nano .env  # or use your editor
```

### Step 3: Start Database & Services
```bash
# Start PostgreSQL, Redis, and MQTT with Docker
docker-compose up -d

# Verify services are running
docker-compose ps

# You should see:
# - solar_postgres (running)
# - solar_redis (running)
# - solar_mqtt (running)
```

### Step 4: Initialize Database
```bash
# The database schema is created automatically on first run
# Or manually:
npm run migrate
```

### Step 5: Start Server
```bash
# Development mode (auto-reload)
npm run dev

# Or production mode
npm start

# Server should start on http://localhost:3000
```

### Step 6: Verify Installation
```bash
# In a new terminal, test the API
curl http://localhost:3000/health

# Should return:
# {"status":"healthy","timestamp":"...","uptime":...}
```

---

## Architecture Overview

### Microservices Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Client Applications                 │
│            (Web, Mobile, IoT Devices)               │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│              API Gateway (Express.js)               │
│    Routes, Auth, Rate Limiting, Error Handling     │
└──┬──────────────────────────────────────────────────┘
   │
   ├──► User Management Service
   │    • Registration, Login, Profiles
   │    • JWT Authentication
   │    • Password Reset
   │
   ├──► IoT Data Service
   │    • MQTT Listener
   │    • Real-time Data Ingestion
   │    • Data Validation & Enrichment
   │    • Anomaly Detection
   │
   ├──► Transaction & Billing Service
   │    • Wallet Management
   │    • Payment Processing
   │    • Settlements
   │
   ├──► Analytics Service (TODO)
   │    • Statistics & Reporting
   │    • Dashboards
   │
   ├──► Notification Service (TODO)
   │    • Email, SMS, Push
   │    • In-app Messages
   │
   └──► ML Orchestration Service (TODO)
        • Forecasting
        • Optimization

         │
         ▼
   ┌─────────────────────────────┐
   │   Data Layer                │
   ├─────────────────────────────┤
   │ • PostgreSQL (Users, Etc)   │
   │ • TimescaleDB (Sensor Data) │
   │ • Redis (Cache & Queue)     │
   │ • MQTT Broker (IoT Comms)   │
   └─────────────────────────────┘
```

### Data Flow Examples

#### Energy Data Ingestion
```
IoT Device
  ↓
MQTT Broker (energy/location/user_id/solar/generation)
  ↓
IoT Data Service
  ├─ Validate message
  ├─ Enrich with user metadata
  ├─ Store in Redis (latest reading)
  ├─ Store in PostgreSQL (recent)
  ├─ Store in TimescaleDB (historical)
  ├─ Check anomalies
  └─ Publish event
  
Event Subscribers:
  ├─ Real-time Dashboard (WebSocket)
  ├─ Analytics Service
  └─ ML Service
```

#### User Registration & Login
```
User Registration Request
  ↓
Validation (email, password strength)
  ↓
Hash Password (bcrypt)
  ↓
Database Transaction:
  ├─ Insert users table
  ├─ Insert wallets table
  ├─ Insert role-specific table (hosts/buyers/investors)
  └─ Insert verification_tokens table
  ↓
Send Verification Email
  ↓
Return user_id & message

User Login Request
  ↓
Find user by email
  ↓
Verify password (bcrypt compare)
  ↓
Check account status (verified, locked, active)
  ↓
Generate JWT tokens (access + refresh)
  ↓
Update last_login_at
  ↓
Return tokens & user profile
```

---

## Project Structure

```
backend/
├── src/
│   ├── config/                 # Configuration management
│   │   └── index.js           # Environment config
│   │
│   ├── database/              # Database setup
│   │   ├── index.js           # Connection pool & query
│   │   └── schema.js          # Table definitions
│   │
│   ├── services/              # Business logic services
│   │   ├── UserManagementService.js
│   │   ├── IoTDataService.js
│   │   ├── TransactionService.js
│   │   ├── AnalyticsService.js (TODO)
│   │   ├── NotificationService.js (TODO)
│   │   └── MLOrchestrationService.js (TODO)
│   │
│   ├── controllers/           # Request handlers
│   │   ├── authController.js
│   │   ├── iotController.js
│   │   ├── transactionController.js
│   │   ├── analyticsController.js (TODO)
│   │   └── notificationController.js (TODO)
│   │
│   ├── routes/               # API route definitions
│   │   ├── authRoutes.js
│   │   ├── iotRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── analyticsRoutes.js (TODO)
│   │   └── notificationRoutes.js (TODO)
│   │
│   ├── middleware/           # Express middleware
│   │   └── auth.js           # Authentication & authorization
│   │
│   ├── utils/               # Utility functions
│   │   ├── logger.js         # Pino logging
│   │   ├── errors.js         # Custom error classes
│   │   ├── auth.js           # JWT & password utilities
│   │   ├── validation.js     # Input validation (Joi)
│   │   └── cache.js          # Redis cache wrapper
│   │
│   └── server.js            # Main Express app
│
├── mqtt-config/             # MQTT Broker configuration
│   ├── mosquitto.conf
│   └── passwd
│
├── package.json            # Dependencies
├── .env.example            # Environment template
├── .gitignore
├── .dockerignore
├── docker-compose.yml      # Local dev environment
├── Dockerfile.prod         # Production Docker image
├── README.md               # Main documentation
├── API_DOCUMENTATION.md    # Detailed API docs
├── DEPLOYMENT.md           # Deployment guide
└── SETUP_GUIDE.md          # This file
```

---

## Services Implemented

### ✅ Completed Services

#### 1. User Management Service
```
Endpoints:
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/verify-email
POST   /api/v1/auth/password-reset-request
POST   /api/v1/auth/password-reset
POST   /api/v1/auth/refresh-token
GET    /api/v1/users/profile
PUT    /api/v1/users/profile

Features:
- User registration with email verification
- Secure login with JWT tokens
- Password hashing (bcrypt)
- Profile management for hosts/buyers/investors
- Account locking after failed attempts
- Password reset with email tokens
```

#### 2. IoT Data Service
```
Endpoints:
POST   /api/v1/iot/ingest
GET    /api/v1/iot/latest/:userId
GET    /api/v1/iot/history/:userId
POST   /api/v1/iot/devices/:deviceId/command

Features:
- MQTT message ingestion
- Schema & range validation
- Data enrichment
- Multi-layer storage:
  - Redis (latest, 1 hour TTL)
  - PostgreSQL (recent, 48 hours)
  - TimescaleDB (historical)
- Anomaly detection
- Device health monitoring
- Command sending to devices
```

#### 3. Transaction & Billing Service
```
Endpoints:
GET    /api/v1/wallet
GET    /api/v1/transactions
POST   /api/v1/wallet/topup
POST   /api/v1/wallet/withdraw
POST   /api/v1/payment/callback
GET    /api/v1/admin/metrics

Features:
- Wallet balance management
- Energy transaction recording
- Revenue distribution (host 45%, investors 35%, platform 20%)
- Payment gateway integration (Razorpay)
- Daily settlements
- Transaction history
- Platform metrics & analytics
```

### 🚀 Ready to Implement

#### 4. ML Orchestration Service
```
Responsibilities:
- Solar generation forecasting
- Demand forecasting
- Supply-demand matching
- Dynamic price calculation
- Optimization algorithms
- Scheduled daily workflows

Tech Stack:
- Apache Airflow (workflow orchestration)
- Python ML services (separate microservice)
- Celery (background jobs)
```

#### 5. Analytics Service
```
Responsibilities:
- Real-time statistics
- Daily/weekly/monthly reports
- User analytics
- Community insights
- Data exports (PDF, CSV)

Tech Stack:
- Materialized views (PostgreSQL)
- TimescaleDB aggregates
- Charting libraries
```

#### 6. Notification Service
```
Responsibilities:
- Email notifications (SendGrid)
- SMS alerts (Twilio)
- Push notifications (Firebase)
- In-app notifications
- Notification preferences

Tech Stack:
- Bull (job queue)
- SendGrid API
- Twilio API
- Firebase Cloud Messaging
```

---

## Configuration Details

### Database Configuration

**PostgreSQL Tables:**
- `users` - User accounts and authentication
- `hosts` - Solar panel owner information
- `buyers` - Energy consumer information
- `investors` - Investor information
- `allocations` - Energy allocation plans
- `transactions` - Financial transactions
- `wallets` - User wallet balances
- `devices` - IoT device registry
- `verification_tokens` - Email & password reset tokens
- `daily_statements` - Daily financial summaries

**TimescaleDB:**
- `energy_readings` - Hypertable for sensor data
  - Partitioned by time (weekly chunks)
  - Auto-compressed after 7 days
  - Automatic retention (2 years)

### Environment Configuration

```env
# Critical for Production
JWT_SECRET=<generate-random-32-chars>
JWT_REFRESH_SECRET=<generate-random-32-chars>
RAZORPAY_KEY_ID=<your-key>
RAZORPAY_KEY_SECRET=<your-secret>
SENDGRID_API_KEY=<your-key>

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=solar_platform
DB_USER=postgres
DB_PASSWORD=<strong-password>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=iot_user
MQTT_PASSWORD=<strong-password>
```

---

## API Usage Examples

### Register User
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "host@example.com",
    "password": "SecureP@ss123",
    "role": "host",
    "full_name": "John Solar",
    "profile": {
      "solar_capacity_kw": 5.0,
      "location": {"lat": 12.9716, "lon": 77.5946},
      "city": "Bangalore"
    }
  }'
```

### Login & Get Token
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "host@example.com", "password": "SecureP@ss123"}'

# Response includes: accessToken, refreshToken
```

### Send IoT Data
```bash
curl -X POST http://localhost:3000/api/v1/iot/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "SM_H123_001",
    "user_id": "host-uuid",
    "timestamp": "2026-01-15T14:30:00Z",
    "measurements": {
      "power_kw": 3.52,
      "energy_kwh": 45.18,
      "voltage": 230.5,
      "current": 15.3
    }
  }'
```

### Get Energy History
```bash
curl -H "Authorization: Bearer <access_token>" \
  "http://localhost:3000/api/v1/iot/history/host-uuid?start=2026-01-01&end=2026-01-15&resolution=hourly"
```

### Check Wallet
```bash
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:3000/api/v1/wallet
```

---

## Testing

### Run Tests
```bash
# Run all tests
npm test

# Run specific test
npm test -- authController.test.js

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage
```

### Manual API Testing with Postman/Insomnia
1. Import provided Postman collection
2. Set `{{BASE_URL}}` to `http://localhost:3000/api/v1`
3. Set `{{ACCESS_TOKEN}}` after login
4. Test endpoints

---

## Next Steps

### Immediate (Day 1-2)
- [ ] Start development server locally
- [ ] Test all authentication endpoints
- [ ] Verify database connectivity
- [ ] Test IoT data ingestion
- [ ] Test transaction endpoints

### Short Term (Week 1)
- [ ] Implement Analytics Service
- [ ] Implement Notification Service
- [ ] Add WebSocket support for real-time updates
- [ ] Create comprehensive test suite

### Medium Term (Week 2-3)
- [ ] Implement ML Orchestration
- [ ] Set up CI/CD pipeline
- [ ] Configure production environment
- [ ] Performance tuning & optimization

### Long Term (Month 2+)
- [ ] Mobile app integration
- [ ] Advanced analytics dashboard
- [ ] Community features (leaderboards, etc.)
- [ ] Investment portal

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Redis Connection Failed
```bash
# Test Redis connection
redis-cli ping

# Should respond: PONG
```

### MQTT Connection Failed
```bash
# Check MQTT broker is running
docker-compose ps mqtt

# Test MQTT connection
mosquitto_sub -h localhost -p 1883 -t "energy/#"
```

### Slow Queries
```bash
# Check query performance in logs
# Look for queries taking > 1 second

# Verify indexes are created
psql -c "\d+ table_name"

# Run query planner
EXPLAIN ANALYZE SELECT * FROM energy_readings ...
```

### Memory Leak
```bash
# Monitor memory usage
docker stats solar-backend

# Generate heap dump
node --inspect=0.0.0.0:9229 src/server.js

# Connect Chrome DevTools
chrome://inspect
```

---

## Support & Resources

### Documentation
- [API Documentation](./API_DOCUMENTATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [README](./README.md)

### External Resources
- [Express.js Docs](https://expressjs.com)
- [PostgreSQL Docs](https://www.postgresql.org/docs)
- [Redis Docs](https://redis.io/docs)
- [MQTT Protocol](http://mqtt.org)
- [JWT.io](https://jwt.io)

### Community
- GitHub Issues
- Email: support@solarsharingplatform.com
- Slack: #backend-dev

---

## License
MIT

---

**Last Updated:** January 2026
**Backend Version:** 1.0.0
**Status:** ✅ Core Services Implemented
