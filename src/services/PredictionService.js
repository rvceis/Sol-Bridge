const db = require('../database');
const logger = require('../utils/logger');
const { cacheGet, cacheSet } = require('../utils/cache');

/**
 * PredictionService: AI/ML predictions for solar energy forecasting and consumption analysis
 * Week 1 MVP: Panel output prediction + Consumption pattern analysis
 */
class PredictionService {
  /**
   * Predict solar panel output for next N days
   * Uses 30-day historical data with exponential smoothing and trend analysis
   */
  async predictPanelOutput(deviceId, userId, days = 7) {
    try {
      // Check cache first
      const cacheKey = `prediction:panel:${deviceId}`;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.info(`Panel prediction cache hit for ${deviceId}`);
        return cached;
      }

      // Get device info
      const deviceResult = await db.query(
        `SELECT * FROM devices WHERE device_id = $1 AND user_id = $2`,
        [deviceId, userId]
      );

      if (deviceResult.rows.length === 0) {
        throw new Error('Device not found');
      }

      const device = deviceResult.rows[0];
      const capacity = device.capacity_kwh || 5; // Default 5kW

      // Get last 30 days of readings
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const readingsResult = await db.query(
        `SELECT time, power_kw FROM energy_readings 
         WHERE device_id = $1 AND user_id = $2 AND time >= $3
         ORDER BY time DESC
         LIMIT 1440`, // ~30 days of hourly data
        [deviceId, userId, thirtyDaysAgo]
      );

      const readings = readingsResult.rows.map(r => ({
        timestamp: new Date(r.time),
        power: parseFloat(r.power_kw) || 0,
      }));

      if (readings.length < 7) {
        logger.warn(`Insufficient data for prediction: only ${readings.length} readings`);
        return this._generateBasePrediction(days, capacity);
      }

      // Calculate daily averages
      const dailyAverages = this._calculateDailyAverages(readings);
      
      // Simple exponential smoothing with trend
      const smoothed = this._exponentialSmoothing(dailyAverages, 0.3, 0.2);
      
      // Generate forecast
      const forecast = this._generateForecast(smoothed, days, capacity);

      // Calculate confidence based on data variance
      const confidence = this._calculateConfidence(dailyAverages);

      const predictions = {
        deviceId,
        generatedAt: new Date(),
        confidence,
        forecasts: forecast,
        metadata: {
          capacity,
          dataPoints: readings.length,
          daysOfHistory: Math.ceil(readings.length / 24),
        },
      };

      // Cache for 6 hours
      await cacheSet(cacheKey, predictions, 6 * 60 * 60);

      return predictions;
    } catch (error) {
      logger.error('Error predicting panel output:', error);
      throw error;
    }
  }

  /**
   * Predict user consumption patterns for next 7 days
   * Analyzes hourly patterns, day-of-week effects, and seasonal trends
   */
  async predictUserConsumption(userId, days = 7) {
    try {
      const cacheKey = `prediction:consumption:${userId}`;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return cached;
      }

      // Get buyer profile
      const buyerResult = await db.query(
        `SELECT monthly_avg_consumption, household_size FROM buyers WHERE user_id = $1`,
        [userId]
      );

      if (buyerResult.rows.length === 0) {
        logger.warn(`No buyer profile for ${userId}`);
        return this._generateDefaultConsumptionPattern(days);
      }

      const buyer = buyerResult.rows[0];
      const monthlyConsumption = parseFloat(buyer.monthly_avg_consumption) || 300; // kWh
      const householdSize = buyer.household_size || 4;

      // Get last 30 days of energy transaction history or meter data
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const transactionsResult = await db.query(
        `SELECT created_at, energy_kwh FROM energy_transactions 
         WHERE buyer_id = $1 AND created_at >= $2
         ORDER BY created_at DESC`,
        [userId, thirtyDaysAgo]
      );

      const transactions = transactionsResult.rows.map(t => ({
        date: new Date(t.created_at),
        kwh: parseFloat(t.energy_kwh) || 0,
      }));

      // Analyze consumption patterns
      const hourlyPattern = this._analyzeHourlyPattern(transactions);
      const dayOfWeekPattern = this._analyzeDayOfWeekPattern(transactions);
      
      // Generate forecast
      const forecast = this._generateConsumptionForecast(
        monthlyConsumption,
        hourlyPattern,
        dayOfWeekPattern,
        days,
        householdSize
      );

      const predictions = {
        userId,
        generatedAt: new Date(),
        forecasts: forecast,
        metadata: {
          monthlyAverage: monthlyConsumption,
          householdSize,
          dataPoints: transactions.length,
          pattern: 'hourly_analysis',
        },
      };

      // Cache for 12 hours
      await cacheSet(cacheKey, predictions, 12 * 60 * 60);

      return predictions;
    } catch (error) {
      logger.error('Error predicting consumption:', error);
      throw error;
    }
  }

  /**
   * Store predictions in database for historical analysis
   */
  async storePredictions(deviceId, userId, predictionType, predictions) {
    try {
      const table = predictionType === 'panel' 
        ? 'panel_predictions' 
        : 'consumption_predictions';

      for (const forecast of predictions.forecasts) {
        await db.query(
          `INSERT INTO ${table} 
           (device_id, user_id, predicted_date, predicted_value, confidence, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (device_id, predicted_date) DO UPDATE SET
           predicted_value = $4, confidence = $5, metadata = $6, updated_at = NOW()`,
          [
            deviceId || null,
            userId || null,
            forecast.date,
            forecast.predicted,
            predictions.confidence || 0.75,
            JSON.stringify(forecast.details || {}),
          ]
        );
      }

      logger.info(`Stored ${predictions.forecasts.length} ${predictionType} predictions`);
      return true;
    } catch (error) {
      logger.error('Error storing predictions:', error);
      throw error;
    }
  }

  /**
   * Get historical prediction accuracy
   */
  async getPredictionAccuracy(deviceId, days = 30) {
    try {
      const result = await db.query(
        `SELECT 
          AVG(ABS(predicted_value - actual_value) / actual_value) as mape,
          COUNT(*) as predictions_evaluated
         FROM panel_predictions
         WHERE device_id = $1 
         AND actual_value IS NOT NULL
         AND predicted_date >= NOW() - INTERVAL '${days} days'`,
        [deviceId]
      );

      if (result.rows.length === 0) {
        return { accuracy: 0, evaluated: 0 };
      }

      const row = result.rows[0];
      return {
        mape: parseFloat(row.mape) || 0,
        predictions_evaluated: parseInt(row.predictions_evaluated) || 0,
        accuracy: 100 - (parseFloat(row.mape) || 0) * 100,
      };
    } catch (error) {
      logger.error('Error getting prediction accuracy:', error);
      return { accuracy: 0, evaluated: 0 };
    }
  }

  // ===== Helper Methods =====

  _calculateDailyAverages(readings) {
    const byDay = {};
    
    readings.forEach(r => {
      const day = r.timestamp.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(r.power);
    });

    return Object.entries(byDay)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, powers]) => ({
        date: new Date(date),
        average: powers.reduce((a, b) => a + b, 0) / powers.length,
        max: Math.max(...powers),
        min: Math.min(...powers),
      }));
  }

  _exponentialSmoothing(data, alpha = 0.3, beta = 0.2) {
    if (data.length === 0) return [];

    const smoothed = [];
    let level = data[0].average;
    let trend = (data[1]?.average || data[0].average) - data[0].average;

    smoothed.push({ level, trend });

    for (let i = 1; i < data.length; i++) {
      const obs = data[i].average;
      const prevLevel = level;
      
      level = alpha * obs + (1 - alpha) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      
      smoothed.push({ level, trend });
    }

    return smoothed;
  }

  _generateForecast(smoothed, days, capacity) {
    if (smoothed.length === 0) {
      return Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        predicted: capacity * 0.5,
        details: { method: 'default' },
      }));
    }

    const lastSmoothed = smoothed[smoothed.length - 1];
    const forecast = [];

    for (let i = 1; i <= days; i++) {
      const predictedValue = Math.max(
        0,
        Math.min(
          capacity,
          lastSmoothed.level + (i * lastSmoothed.trend)
        )
      );

      forecast.push({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
        predicted: parseFloat(predictedValue.toFixed(2)),
        details: {
          level: lastSmoothed.level,
          trend: lastSmoothed.trend,
          day: i,
        },
      });
    }

    return forecast;
  }

  _calculateConfidence(dailyAverages) {
    if (dailyAverages.length < 2) return 0.5;

    const avg = dailyAverages.reduce((sum, d) => sum + d.average, 0) / dailyAverages.length;
    const variance = dailyAverages.reduce((sum, d) => sum + Math.pow(d.average - avg, 2), 0) / dailyAverages.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / avg; // Coefficient of variation

    // Higher CV = more variable = lower confidence
    return Math.max(0.3, Math.min(0.95, 1 - (cv / 2)));
  }

  _generateBasePrediction(days, capacity) {
    return {
      deviceId: 'unknown',
      forecasts: Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        predicted: capacity * 0.5,
      })),
      confidence: 0.5,
    };
  }

  _analyzeHourlyPattern(transactions) {
    const hourlyData = Array(24).fill(0).map(() => []);

    transactions.forEach(t => {
      const hour = t.date.getHours();
      hourlyData[hour].push(t.kwh);
    });

    return hourlyData.map((values, hour) => ({
      hour,
      average: values.length > 0 
        ? values.reduce((a, b) => a + b, 0) / values.length 
        : 0,
    }));
  }

  _analyzeDayOfWeekPattern(transactions) {
    const dayData = Array(7).fill(0).map(() => []);

    transactions.forEach(t => {
      const day = t.date.getDay();
      dayData[day].push(t.kwh);
    });

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayData.map((values, dayIndex) => ({
      day: days[dayIndex],
      dayIndex,
      average: values.length > 0 
        ? values.reduce((a, b) => a + b, 0) / values.length 
        : 0,
    }));
  }

  _generateConsumptionForecast(monthlyAvg, hourlyPattern, dayPattern, days, householdSize) {
    const dailyAvg = monthlyAvg / 30;
    const forecast = [];

    for (let i = 0; i < days; i++) {
      const forecastDate = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = forecastDate.getDay();
      const dayMultiplier = dayPattern[dayOfWeek]?.average 
        ? dayPattern[dayOfWeek].average / (monthlyAvg / 30) 
        : 1;

      const hourlyForecast = hourlyPattern.map(hp => ({
        hour: hp.hour,
        consumption: (dailyAvg * dayMultiplier * hp.average) / 24,
      }));

      const dailyTotal = hourlyForecast.reduce((sum, h) => sum + h.consumption, 0);

      forecast.push({
        date: forecastDate,
        predicted: parseFloat(dailyTotal.toFixed(2)),
        details: {
          hourly: hourlyForecast,
          dayMultiplier,
          householdSize,
        },
      });
    }

    return forecast;
  }

  _generateDefaultConsumptionPattern(days) {
    return {
      userId: 'unknown',
      forecasts: Array.from({ length: days }, (_, i) => ({
        date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        predicted: 10, // Default 10 kWh/day
      })),
    };
  }
}

module.exports = new PredictionService();
