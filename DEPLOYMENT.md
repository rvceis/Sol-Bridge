# Deployment Guide

## Local Development Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### Step 1: Clone Repository
```bash
git clone <repo-url>
cd Solar_Sharing/backend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Setup Environment
```bash
cp .env.example .env
```

Edit `.env` with your local configuration:
```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=solar_platform
DB_USER=postgres
DB_PASSWORD=postgres

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=dev-secret-change-in-prod
```

### Step 4: Start Services
```bash
# Start database, redis, mqtt
docker-compose up -d

# Verify services are running
docker-compose ps
```

### Step 5: Run Server
```bash
# Development (with auto-reload)
npm run dev

# Or production
npm start
```

Server will be available at `http://localhost:3000`

### Step 6: Test API
```bash
# Health check
curl http://localhost:3000/health

# Register user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecureP@ss123",
    "role": "host",
    "full_name": "John Doe",
    "profile": {
      "solar_capacity_kw": 5.0,
      "location": {
        "lat": 12.9716,
        "lon": 77.5946
      },
      "address": "123 Main St",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560001"
    }
  }'
```

## Docker Development Environment

### Start All Services
```bash
docker-compose up -d
```

Services running:
- Backend: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- MQTT: localhost:1883

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Stop Services
```bash
docker-compose down

# Remove volumes (reset data)
docker-compose down -v
```

## Production Deployment

### Option 1: Docker Container

#### Build Image
```bash
docker build -f Dockerfile.prod -t solar-backend:1.0.0 .
```

#### Run Container
```bash
docker run -d \
  --name solar-backend \
  -e NODE_ENV=production \
  -e DB_HOST=prod-postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=solar_platform \
  -e DB_USER=postgres \
  -e DB_PASSWORD=$(openssl rand -base64 32) \
  -e REDIS_HOST=prod-redis \
  -e JWT_SECRET=$(openssl rand -base64 32) \
  -e JWT_REFRESH_SECRET=$(openssl rand -base64 32) \
  -p 3000:3000 \
  solar-backend:1.0.0
```

### Option 2: Kubernetes

Create `k8s-deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: solar-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: solar-backend
  template:
    metadata:
      labels:
        app: solar-backend
    spec:
      containers:
      - name: solar-backend
        image: solar-backend:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: db-config
              key: host
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: solar-backend-service
spec:
  selector:
    app: solar-backend
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

Deploy:
```bash
kubectl apply -f k8s-deployment.yaml
```

### Option 3: AWS ECS

1. Create ECR repository:
```bash
aws ecr create-repository --repository-name solar-backend
```

2. Build and push image:
```bash
docker build -t solar-backend:1.0.0 .
docker tag solar-backend:1.0.0 <account>.dkr.ecr.us-east-1.amazonaws.com/solar-backend:1.0.0
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/solar-backend:1.0.0
```

3. Create ECS task definition and service

### Database Migration for Production

```bash
# Connect to production database
PGPASSWORD=<password> psql -h prod-db.example.com -U postgres -d solar_platform

# Run migrations
psql -h prod-db.example.com -U postgres -d solar_platform -f src/database/schema.js
```

## Environment Variables (Production)

```env
# Server
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=solar_platform
DB_USER=<db-username>
DB_PASSWORD=<strong-password>
DB_POOL_MIN=10
DB_POOL_MAX=50

# Redis (use managed service like ElastiCache)
REDIS_HOST=<elasticache-endpoint>
REDIS_PORT=6379
REDIS_PASSWORD=<strong-password>

# JWT (generate with: openssl rand -base64 32)
JWT_SECRET=<random-secret>
JWT_REFRESH_SECRET=<random-secret>

# MQTT
MQTT_BROKER_URL=mqtt://<mqtt-broker>:1883
MQTT_USERNAME=<iot-user>
MQTT_PASSWORD=<strong-password>

# Email Service
SENDGRID_API_KEY=<sendgrid-key>

# SMS Service
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<auth-token>
TWILIO_PHONE_NUMBER=<phone>

# Payment Gateway
RAZORPAY_KEY_ID=<key-id>
RAZORPAY_KEY_SECRET=<key-secret>

# Weather API
WEATHER_API_KEY=<openweathermap-key>

# ML Services
ML_SERVICE_URL=<ml-service-endpoint>
OPTIMIZATION_SERVICE_URL=<optimization-service-endpoint>

# Monitoring
SENTRY_DSN=<sentry-dsn>

# Security
CORS_ORIGINS=https://app.example.com,https://api.example.com
```

## SSL/TLS Setup

### Using Let's Encrypt with Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring & Logging

### CloudWatch (AWS)
```bash
# Install CloudWatch agent
npm install aws-sdk

# Configure logging in server.js
const cloudwatch = new AWS.CloudWatch();
```

### ELK Stack (Self-hosted)
```bash
# Ships logs to Elasticsearch
npm install winston-elasticsearch
```

### Sentry (Error Tracking)
```bash
npm install @sentry/node

# Initialize in server.js
const Sentry = require('@sentry/node');
Sentry.init({ dsn: config.sentry.dsn });
```

## Backup Strategy

### PostgreSQL Backups
```bash
# Daily automated backup
0 2 * * * PGPASSWORD=password pg_dump -h prod-db -U postgres solar_platform | gzip > /backups/solar_$(date +\%Y\%m\%d).sql.gz

# Restore from backup
gunzip < /backups/solar_20260101.sql.gz | psql -h prod-db -U postgres solar_platform
```

### Redis Backups
```bash
# Enable persistence in Redis configuration
save 900 1
save 300 10
save 60 10000

# Backup RDB files
cp /var/lib/redis/dump.rdb /backups/redis_$(date +%Y%m%d).rdb
```

## Scaling Recommendations

### Horizontal Scaling
- Run multiple instances behind load balancer
- Use auto-scaling groups based on CPU/Memory
- Configure sticky sessions for WebSocket connections

### Vertical Scaling
- Increase database connection pool
- Increase Redis memory
- Increase server RAM/CPU

### Database Optimization
- Enable query caching
- Create indexes on frequently queried columns
- Enable TimescaleDB compression
- Archive old data to cold storage

### Caching Strategy
- Redis for hot data (latest readings, profiles)
- CDN for static assets
- Browser caching with proper headers

## Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Database connectivity
curl -X GET http://localhost:3000/health/db

# Redis connectivity
curl -X GET http://localhost:3000/health/redis

# MQTT connectivity
curl -X GET http://localhost:3000/health/mqtt
```

## Rollback Procedure

```bash
# Switch to previous image
docker service update --image solar-backend:0.9.0 solar-backend

# Or with ECS
aws ecs update-service --cluster production --service solar-backend --force-new-deployment
```

## Post-Deployment Checklist

- [ ] Verify all services are running
- [ ] Check application logs for errors
- [ ] Run smoke tests
- [ ] Verify database connectivity
- [ ] Verify cache connectivity
- [ ] Test email notifications
- [ ] Test SMS notifications
- [ ] Test payment gateway integration
- [ ] Verify SSL/TLS certificates
- [ ] Monitor server metrics
- [ ] Check error tracking (Sentry)
- [ ] Verify backups are working
- [ ] Document deployment details
- [ ] Notify team of deployment

## Troubleshooting Deployment

### Application won't start
```bash
# Check logs
docker logs solar-backend

# Verify environment variables
docker inspect solar-backend | grep -A 20 Env

# Check network connectivity
docker exec solar-backend ping postgres
```

### Database connection failures
```bash
# Test connection
psql -h <host> -U <user> -d <database>

# Check connection pool
SELECT count(*) FROM pg_stat_activity;
```

### Memory leaks
```bash
# Monitor memory usage
docker stats --no-stream solar-backend

# Generate heap dump
node --inspect=0.0.0.0:9229 src/server.js
```
