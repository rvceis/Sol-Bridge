/**
 * ML Service Client with exponential backoff, timeout, and circuit breaker.
 * 
 * Calls ML service endpoints for solar forecast, demand, risk, and anomaly predictions.
 * Handles retries, timeouts, and service degradation.
 */

const axios = require('axios');
const logger = require('./logger');

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 60s
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  getState() {
    return this.state;
  }
}

class MLClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || process.env.ML_SERVICE_URL || 'http://localhost:8000';
    this.timeout = options.timeout || 30000; // 30s
    this.maxRetries = options.maxRetries || 3;
    this.initialBackoff = options.initialBackoff || 1000; // 1s
    this.maxBackoff = options.maxBackoff || 30000; // 30s
    
    this.circuitBreaker = new CircuitBreaker(options.circuitBreakerOptions);
    
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Exponential backoff with jitter.
   * Formula: min(maxBackoff, initialBackoff * 2^retryCount) + random(0, 1000)
   */
  _calculateBackoff(retryCount) {
    const exponential = this.initialBackoff * Math.pow(2, retryCount);
    const capped = Math.min(this.maxBackoff, exponential);
    const jitter = Math.random() * 1000;
    return capped + jitter;
  }

  /**
   * Retry wrapper with exponential backoff.
   */
  async _withRetry(fn, operationName = 'operation') {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.info(`${operationName} attempt ${attempt + 1}/${this.maxRetries}`);
        return await this.circuitBreaker.call(fn);
      } catch (error) {
        lastError = error;
        
        const isRetryable = this._isRetryable(error);
        logger.warn(
          `${operationName} failed (attempt ${attempt + 1}): ${error.message}`,
          { retryable: isRetryable, circuitBreakerState: this.circuitBreaker.getState() }
        );
        
        if (!isRetryable || attempt === this.maxRetries - 1) {
          break;
        }
        
        const backoff = this._calculateBackoff(attempt);
        logger.info(`Backing off for ${Math.round(backoff)}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
    
    throw lastError;
  }

  /**
   * Determine if error is retryable.
   */
  _isRetryable(error) {
    if (!error.response) {
      // Network error, timeout, etc.
      return true;
    }
    
    const status = error.response.status;
    // Retry on 5xx, 429 (rate limit), or 503 (service unavailable)
    // Do NOT retry on 4xx client errors (except 429)
    return status >= 500 || status === 429;
  }

  /**
   * Solar generation forecast.
   * 
   * POST /api/v1/forecast/solar
   * {
   *   "ghi": 500,
   *   "temperature": 25,
   *   "hour": 12,
   *   "system_capacity_kw": 5.0
   * }
   */
  async predictSolarGeneration(features) {
    return this._withRetry(
      async () => {
        const response = await this.axiosInstance.post('/api/v1/forecast/solar', features);
        return response.data;
      },
      'Solar forecast prediction'
    );
  }

  /**
   * Demand/consumption forecast.
   * 
   * POST /api/v1/forecast/demand
   * {
   *   "hour": 12,
   *   "day_of_week": 2,
   *   "temperature": 25,
   *   "humidity": 60
   * }
   */
  async predictDemand(features) {
    return this._withRetry(
      async () => {
        const response = await this.axiosInstance.post('/api/v1/forecast/demand', features);
        return response.data;
      },
      'Demand forecast prediction'
    );
  }

  /**
   * Dynamic pricing prediction.
   * 
   * POST /api/v1/forecast/pricing
   * {
   *   "solar_forecast_kw": 2.5,
   *   "demand_forecast_kw": 1.2,
   *   "time_of_use": "peak"
   * }
   */
  async predictPricing(features) {
    return this._withRetry(
      async () => {
        const response = await this.axiosInstance.post('/api/v1/forecast/pricing', features);
        return response.data;
      },
      'Pricing prediction'
    );
  }

  /**
   * Risk scoring.
   * 
   * POST /api/v1/risk/score
   * {
   *   "volatility": 0.15,
   *   "price_ratio": 1.2,
   *   "anomaly_score": 0.05
   * }
   */
  async scoreRisk(features) {
    return this._withRetry(
      async () => {
        const response = await this.axiosInstance.post('/api/v1/risk/score', features);
        return response.data;
      },
      'Risk scoring'
    );
  }

  /**
   * Anomaly detection.
   * 
   * POST /api/v1/anomaly/detect
   * {
   *   "power_kw": 5.2,
   *   "voltage_v": 240,
   *   "frequency_hz": 50.0
   * }
   */
  async detectAnomaly(features) {
    return this._withRetry(
      async () => {
        const response = await this.axiosInstance.post('/api/v1/anomaly/detect', features);
        return response.data;
      },
      'Anomaly detection'
    );
  }

  /**
   * Health check.
   * 
   * GET /health
   */
  async healthCheck() {
    return this._withRetry(
      async () => {
        const response = await this.axiosInstance.get('/health');
        return response.data;
      },
      'Health check'
    );
  }

  /**
   * Batch predictions.
   * 
   * POST /api/v1/batch/forecast
   * {
   *   "type": "solar",
   *   "records": [
   *     { "ghi": 500, "temperature": 25, "hour": 12, "system_capacity_kw": 5.0 },
   *     ...
   *   ]
   * }
   */
  async batchPredict(type, records) {
    return this._withRetry(
      async () => {
        const response = await this.axiosInstance.post('/api/v1/batch/forecast', {
          type,
          records
        });
        return response.data;
      },
      `Batch ${type} prediction`
    );
  }

  /**
   * Get circuit breaker state.
   */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }
}

module.exports = MLClient;
