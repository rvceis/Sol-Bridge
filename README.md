# Solar Sharing Platform - Backend

AI & ML-Based Community Energy Sharing Platform Backend Implementation

## Architecture Overview

This backend implements a comprehensive microservices architecture for the Solar Sharing Platform with the following services:

1. **API Gateway** - Request routing, authentication, rate limiting
2. **User Management Service** - Registration, login, profiles
3. **IoT Data Service** - Real-time sensor data ingestion
4. **ML Orchestration Service** - Forecasting and optimization
5. **Transaction & Billing Service** - Financial operations
6. **Analytics Service** - Statistics and reports
7. **Notification Service** - Multi-channel communications

## Technology Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Language:** JavaScript

### Databases
- **PostgreSQL 16** - Primary relational database
- **TimescaleDB** - Time-series data (energy readings)
- **Redis 7** - Cache and session store

### Message Queues & Real-time
- **MQTT** - IoT device communication
- **Redis Pub/Sub** - Internal event streaming

### External Services
- **Sendgrid** - Email delivery
- **Twilio** - SMS delivery
- **Razorpay** - Payment processing
- **OpenWeatherMap** - Weather data

## Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose (for local dev environment)
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)
- Git

## Quick Start

### 1. Clone and Setup

```bash
cd backend
npm install
cp .env.example .env
```

### 2. Start Services with Docker

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- TimescaleDB (port 5433)
- Redis (port 6379)
- MQTT Broker (port 1883)

### 3. Configure Environment

Edit `.env` with your settings:

```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=solar_platform
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRY=24h

# External APIs (optional for development)
SENDGRID_API_KEY=
WEATHER_API_KEY=
```

### 4. Run Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

## Project Structure

```
backend/
├── src/
│   ├── config/              # Configuration files
│   ├── controllers/         # Request handlers
│   ├── services/            # Business logic
│   ├── routes/              # API routes
│   ├── middleware/          # Express middleware
│   ├── database/            # Database setup and migrations
│   ├── models/              # Data models
│   ├── utils/               # Utilities (auth, errors, cache, etc.)
│   └── server.js            # Express app setup
├── package.json
├── .env.example
├── docker-compose.yml       # Local development environment
└── README.md
```

## API Endpoints

### Authentication

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/verify-email?token=...
POST   /api/v1/auth/password-reset-request
POST   /api/v1/auth/password-reset
POST   /api/v1/auth/refresh-token
```

### User Profile

```
GET    /api/v1/users/profile          (Protected)
PUT    /api/v1/users/profile          (Protected)
```

### IoT Data

```
POST   /api/v1/iot/ingest                    (IoT Device)
GET    /api/v1/iot/latest/:userId           (Protected)
GET    /api/v1/iot/history/:userId          (Protected)
POST   /api/v1/iot/devices/register          (Protected)
POST   /api/v1/iot/devices/:deviceId/command (Protected)
```

### Wallet & Transactions

```
GET    /api/v1/wallet                   (Protected)
GET    /api/v1/transactions             (Protected)
POST   /api/v1/wallet/topup             (Protected)
POST   /api/v1/wallet/withdraw          (Protected)
POST   /api/v1/payment/callback         (Payment Gateway)
GET    /api/v1/admin/metrics            (Protected, Admin)
```

## Database Schema

### Core Tables

1. **users** - User accounts (email, password, role)
2. **hosts** - Solar panel owners
3. **buyers** - Energy consumers
4. **investors** - Platform investors
5. **devices** - IoT device registry
6. **allocations** - Energy allocation plans
7. **transactions** - Financial records
8. **wallets** - User account balances
9. **energy_readings** - TimescaleDB hypertable for sensor data

## Authentication

JWT-based authentication with:
- Access tokens (24 hours)
- Refresh tokens (30 days)
- Role-based access control (RBAC)

Roles: `host`, `buyer`, `investor`, `admin`

## Error Handling

Standard error responses with:
- Error type (class name)
- Human-readable message
- HTTP status code
- Additional details when relevant

```json
{
  "error": "ValidationError",
  "message": "Email already registered",
  "statusCode": 409,
  "details": { "field": "email" }
}
```

## Development Commands

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format

# Stop all services
docker-compose down
```

## Testing

Using Jest and Supertest:

```bash
npm test
```

Test files: `src/**/*.test.js`

## Security Features

- ✅ CORS protection
- ✅ Helmet.js security headers
- ✅ Rate limiting (100 req/min per user)
- ✅ Password hashing with bcrypt (cost factor 12)
- ✅ JWT token signing
- ✅ SQL injection prevention (parameterized queries)
- ✅ Account locking after failed attempts
- ✅ Email verification
- ✅ Password reset tokens with expiry

## Performance Optimizations

- ✅ Database connection pooling
- ✅ Redis caching (latest readings, profiles, forecasts)
- ✅ TimescaleDB compression (automatic after 7 days)
- ✅ Query optimization with indexes
- ✅ Continuous aggregates (hourly/daily stats)
- ✅ Materialized views for pre-computed metrics

## Monitoring & Logging

- Structured logging with Pino
- Request/response logging
- Error tracking and aggregation
- Performance metrics (query times, error rates)
- Health check endpoint: `/health`

## Next Steps

1. **Implement IoT Service** - MQTT listener, data validation, storage
2. **Implement ML Orchestration** - Forecasting, optimization
3. **Implement Transaction Service** - Billing, settlements
4. **Implement Analytics Service** - Reports, dashboards
5. **Implement Notification Service** - Email, SMS, push, in-app
6. **Add WebSocket Service** - Real-time updates

## Contributing

Follow these guidelines:
- Use Node.js conventions
- Follow existing code style
- Write tests for new features
- Update documentation

## Deployment

### Production Checklist

- [ ] Update `.env` with production values
- [ ] Enable HTTPS/SSL
- [ ] Set strong JWT secrets
- [ ] Configure database backups
- [ ] Set up monitoring and alerts
- [ ] Configure CI/CD pipeline
- [ ] Set up log aggregation
- [ ] Configure database replicas
- [ ] Set up Redis cluster for HA
- [ ] Configure API rate limiting

### Docker Production Build

```bash
docker build -f Dockerfile.prod -t solar-backend:1.0.0 .
docker run -d \
  -e NODE_ENV=production \
  -e DB_HOST=prod-db \
  -e REDIS_HOST=prod-redis \
  -p 3000:3000 \
  solar-backend:1.0.0
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL status
docker ps | grep postgres

# View logs
docker logs solar_postgres

# Restart
docker-compose restart postgres
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli ping

# Check logs
docker logs solar_redis
```

### Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

## License

MIT

## Support

For issues and questions, please create an issue on GitHub.
# Sol-Bridge
