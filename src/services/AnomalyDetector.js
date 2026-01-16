const db = require('../database');
const logger = require('../utils/logger');
const { cacheGet, cacheSet } = require('../utils/cache');

/**
 * AnomalyDetector: Equipment health monitoring and failure prediction
 * Week 4: Degradation detection, failure prediction, peer matching
 */
class AnomalyDetector {
  /**
   * Detect panel degradation by analyzing efficiency trends over time
   */
  async detectDegradation(deviceId, userId) {
    try {
      // Get 90 days of readings for trend analysis
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      const readingsResult = await db.query(
        `SELECT 
          DATE(time) as reading_date,
          AVG(power_kw) as avg_power,
          MAX(power_kw) as max_power
         FROM energy_readings
         WHERE device_id = $1 AND user_id = $2 AND time >= $3
         GROUP BY DATE(time)
         ORDER BY DATE(time)`,
        [deviceId, userId, ninetyDaysAgo]
      );

      if (readingsResult.rows.length < 30) {
        return {
          status: 'insufficient_data',
          message: 'Need at least 30 days of data for degradation analysis',
          dataPoints: readingsResult.rows.length,
        };
      }

      const readings = readingsResult.rows.map(r => ({
        date: new Date(r.reading_date),
        avgPower: parseFloat(r.avg_power) || 0,
        maxPower: parseFloat(r.max_power) || 0,
      }));

      // Calculate linear regression to detect declining trend
      const regression = this._calculateLinearRegression(readings);
      
      // Calculate efficiency variance
      const variance = this._calculateVariance(readings.map(r => r.avgPower));
      
      // Detect anomalies
      const anomalies = this._detectAnomalies(readings);
      
      // Calculate degradation rate (% per year)
      const degradationRate = (regression.slope / regression.intercept) * 365 * 100;
      
      // Determine health status
      let healthStatus = 'healthy';
      let severity = 'low';
      let recommendations = [];
      
      if (Math.abs(degradationRate) > 5) {
        healthStatus = 'degrading';
        severity = 'high';
        recommendations.push('Panel efficiency declining significantly');
        recommendations.push('Schedule professional inspection');
        recommendations.push('Check for shading, dirt, or physical damage');
      } else if (Math.abs(degradationRate) > 2) {
        healthStatus = 'minor_degradation';
        severity = 'medium';
        recommendations.push('Slight efficiency decline detected');
        recommendations.push('Clean panels and check connections');
      } else {
        recommendations.push('Panels performing within normal range');
        recommendations.push('Continue regular maintenance');
      }
      
      if (anomalies.length > 5) {
        recommendations.push(`${anomalies.length} anomalous readings detected`);
        severity = severity === 'low' ? 'medium' : 'high';
      }
      
      // Store alert if degradation detected
      if (healthStatus !== 'healthy') {
        await this._storeAnomalyAlert(
          deviceId,
          userId,
          'degradation',
          severity,
          `Panel degradation detected: ${degradationRate.toFixed(2)}% per year`,
          { degradationRate, regression, anomalies: anomalies.length }
        );
      }
      
      return {
        deviceId,
        healthStatus,
        severity,
        degradationRate: parseFloat(degradationRate.toFixed(2)),
        trend: regression.slope < 0 ? 'declining' : 'stable',
        confidence: this._calculateConfidence(readings.length, variance),
        anomaliesDetected: anomalies.length,
        recommendations,
        metrics: {
          dataPoints: readings.length,
          avgOutput: parseFloat((readings.reduce((sum, r) => sum + r.avgPower, 0) / readings.length).toFixed(2)),
          variance: parseFloat(variance.toFixed(2)),
          rSquared: regression.rSquared,
        },
        analyzedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error detecting degradation:', error);
      throw error;
    }
  }

  /**
   * Detect equipment failure patterns (sudden drops, inverter issues)
   */
  async detectEquipmentFailure(deviceId, userId) {
    try {
      // Get last 7 days of readings
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const readingsResult = await db.query(
        `SELECT time, power_kw, voltage, temperature
         FROM energy_readings
         WHERE device_id = $1 AND user_id = $2 AND time >= $3
         ORDER BY time DESC`,
        [deviceId, userId, sevenDaysAgo]
      );

      const readings = readingsResult.rows;
      
      if (readings.length < 10) {
        return {
          status: 'insufficient_data',
          message: 'Need more recent data for failure detection',
        };
      }

      const issues = [];
      
      // Check for sudden power drops
      for (let i = 1; i < Math.min(readings.length, 100); i++) {
        const current = parseFloat(readings[i].power_kw) || 0;
        const previous = parseFloat(readings[i - 1].power_kw) || 0;
        
        if (previous > 1 && current < previous * 0.3) {
          issues.push({
            type: 'sudden_drop',
            severity: 'critical',
            timestamp: readings[i].time,
            description: `Power dropped from ${previous.toFixed(2)} kW to ${current.toFixed(2)} kW`,
          });
        }
      }
      
      // Check for voltage anomalies
      const voltageReadings = readings
        .map(r => parseFloat(r.voltage))
        .filter(v => v > 0);
      
      if (voltageReadings.length > 0) {
        const avgVoltage = voltageReadings.reduce((a, b) => a + b, 0) / voltageReadings.length;
        const outOfRange = voltageReadings.filter(v => v < 200 || v > 260);
        
        if (outOfRange.length > voltageReadings.length * 0.1) {
          issues.push({
            type: 'voltage_anomaly',
            severity: 'high',
            description: `${outOfRange.length} voltage readings out of safe range (200-260V)`,
            avgVoltage: avgVoltage.toFixed(1),
          });
        }
      }
      
      // Check for temperature issues
      const tempReadings = readings
        .map(r => parseFloat(r.temperature))
        .filter(t => t > 0);
      
      if (tempReadings.length > 0) {
        const maxTemp = Math.max(...tempReadings);
        if (maxTemp > 85) {
          issues.push({
            type: 'overheating',
            severity: 'critical',
            description: `Panel temperature reached ${maxTemp.toFixed(1)}°C (critical threshold: 85°C)`,
          });
        }
      }
      
      // Check for zero output during daylight hours
      const zeroOutputDaytime = readings.filter(r => {
        const hour = new Date(r.time).getHours();
        const power = parseFloat(r.power_kw) || 0;
        return hour >= 9 && hour <= 17 && power < 0.1;
      });
      
      if (zeroOutputDaytime.length > 10) {
        issues.push({
          type: 'no_output',
          severity: 'critical',
          description: `No power output detected during ${zeroOutputDaytime.length} daytime readings`,
        });
      }
      
      // Store critical alerts
      for (const issue of issues.filter(i => i.severity === 'critical')) {
        await this._storeAnomalyAlert(
          deviceId,
          userId,
          issue.type,
          issue.severity,
          issue.description,
          issue
        );
      }
      
      return {
        deviceId,
        status: issues.length === 0 ? 'operational' : 'issues_detected',
        issuesFound: issues.length,
        issues,
        checkedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error detecting equipment failure:', error);
      throw error;
    }
  }

  /**
   * Get all anomaly alerts for a user
   */
  async getUserAnomalyAlerts(userId, resolved = false) {
    try {
      const query = resolved
        ? `SELECT * FROM anomaly_alerts WHERE user_id = $1 ORDER BY detected_at DESC LIMIT 50`
        : `SELECT * FROM anomaly_alerts WHERE user_id = $1 AND resolved_at IS NULL ORDER BY detected_at DESC`;
      
      const result = await db.query(query, [userId]);
      
      return {
        alerts: result.rows.map(row => ({
          id: row.id,
          deviceId: row.device_id,
          type: row.alert_type,
          severity: row.severity,
          description: row.description,
          detectedAt: row.detected_at,
          resolvedAt: row.resolved_at,
          metadata: row.metadata,
        })),
      };
    } catch (error) {
      logger.error('Error getting anomaly alerts:', error);
      throw error;
    }
  }

  /**
   * Mark anomaly alert as resolved
   */
  async resolveAlert(alertId, userId, resolutionNotes) {
    try {
      await db.query(
        `UPDATE anomaly_alerts 
         SET resolved_at = NOW(), resolution_notes = $1
         WHERE id = $2 AND user_id = $3`,
        [resolutionNotes, alertId, userId]
      );
      
      return { success: true };
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  // ===== Helper Methods =====

  _calculateLinearRegression(data) {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    data.forEach((point, index) => {
      sumX += index;
      sumY += point.avgPower;
      sumXY += index * point.avgPower;
      sumX2 += index * index;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    let ssTotal = 0, ssResidual = 0;
    data.forEach((point, index) => {
      const predicted = slope * index + intercept;
      ssTotal += Math.pow(point.avgPower - yMean, 2);
      ssResidual += Math.pow(point.avgPower - predicted, 2);
    });
    const rSquared = 1 - (ssResidual / ssTotal);
    
    return { slope, intercept, rSquared };
  }

  _calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  _detectAnomalies(readings) {
    const values = readings.map(r => r.avgPower);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(this._calculateVariance(values));
    
    // Detect values beyond 2 standard deviations
    const anomalies = readings.filter((r, i) => {
      const zScore = Math.abs((r.avgPower - mean) / stdDev);
      return zScore > 2;
    });
    
    return anomalies;
  }

  _calculateConfidence(dataPoints, variance) {
    let confidence = 0.5;
    
    // More data points = higher confidence
    if (dataPoints > 30) confidence += 0.1;
    if (dataPoints > 60) confidence += 0.1;
    if (dataPoints > 90) confidence += 0.1;
    
    // Lower variance = higher confidence
    if (variance < 0.5) confidence += 0.1;
    if (variance < 0.2) confidence += 0.1;
    
    return Math.min(0.95, confidence);
  }

  async _storeAnomalyAlert(deviceId, userId, type, severity, description, metadata) {
    try {
      await db.query(
        `INSERT INTO anomaly_alerts 
         (device_id, user_id, alert_type, severity, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deviceId, userId, type, severity, description, JSON.stringify(metadata)]
      );
    } catch (error) {
      logger.error('Error storing anomaly alert:', error);
    }
  }
}

module.exports = new AnomalyDetector();
