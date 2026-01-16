const db = require('../database');
const logger = require('../utils/logger');
const { cacheGet, cacheSet } = require('../utils/cache');

/**
 * PricingService: Dynamic pricing optimization and market analysis
 * Week 3: Market price integration, optimal trading times, demand-based pricing
 */
class PricingService {
  /**
   * Get recommended selling price for a user based on:
   * - Current market rates
   * - Supply/demand balance
   * - User's historical pricing
   * - Time of day
   */
  async getPricingRecommendation(userId) {
    try {
      const cacheKey = `pricing:recommendation:${userId}`;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return cached;
      }

      // Get current market statistics
      const marketStats = await this._getMarketStatistics();
      
      // Get supply/demand ratio
      const supplyDemand = await this._getSupplyDemandRatio();
      
      // Get time-of-day pricing multiplier
      const timeMultiplier = this._getTimeOfDayMultiplier();
      
      // Calculate base price
      const basePrice = marketStats.avgPrice || 5.0; // Default ₹5/kWh
      
      // Adjust for supply/demand
      let adjustedPrice = basePrice;
      if (supplyDemand.ratio < 0.8) {
        // Low supply, high demand - increase price
        adjustedPrice = basePrice * (1 + (0.8 - supplyDemand.ratio) * 0.5);
      } else if (supplyDemand.ratio > 1.2) {
        // High supply, low demand - decrease price
        adjustedPrice = basePrice * (1 - (supplyDemand.ratio - 1.2) * 0.3);
      }
      
      // Apply time-of-day multiplier
      adjustedPrice *= timeMultiplier;
      
      // Get user's pricing strategy (if exists)
      const userStrategy = await this._getUserPricingStrategy(userId);
      if (userStrategy.minPrice) {
        adjustedPrice = Math.max(adjustedPrice, userStrategy.minPrice);
      }
      if (userStrategy.maxPrice) {
        adjustedPrice = Math.min(adjustedPrice, userStrategy.maxPrice);
      }
      
      const recommendation = {
        recommendedPrice: parseFloat(adjustedPrice.toFixed(2)),
        marketAverage: parseFloat(basePrice.toFixed(2)),
        priceRange: {
          min: parseFloat((adjustedPrice * 0.9).toFixed(2)),
          max: parseFloat((adjustedPrice * 1.1).toFixed(2)),
        },
        factors: {
          supplyDemandRatio: supplyDemand.ratio,
          timeOfDay: timeMultiplier,
          marketTrend: supplyDemand.trend,
        },
        confidence: this._calculatePricingConfidence(marketStats, supplyDemand),
        generatedAt: new Date(),
      };
      
      // Cache for 1 hour
      await cacheSet(cacheKey, recommendation, 60 * 60);
      
      return recommendation;
    } catch (error) {
      logger.error('Error getting pricing recommendation:', error);
      throw error;
    }
  }

  /**
   * Get optimal trading times based on:
   * - Historical transaction volume
   * - Price patterns
   * - Supply/demand cycles
   */
  async getOptimalTradingTimes() {
    try {
      const cacheKey = 'pricing:optimal-times';
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return cached;
      }

      // Analyze last 30 days of transactions
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const transactionsResult = await db.query(
        `SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as transaction_count,
          AVG(price_per_kwh) as avg_price,
          SUM(energy_kwh) as total_energy
         FROM energy_transactions
         WHERE created_at >= $1
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hour`,
        [thirtyDaysAgo]
      );

      const hourlyData = transactionsResult.rows;
      
      // Find peak hours (highest volume and price)
      const peakHours = hourlyData
        .map(row => ({
          hour: parseInt(row.hour),
          volume: parseInt(row.transaction_count),
          price: parseFloat(row.avg_price),
          energy: parseFloat(row.total_energy),
          score: (parseInt(row.transaction_count) * parseFloat(row.avg_price)) / 100,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      // Find off-peak hours (lowest prices - good for buying)
      const offPeakHours = hourlyData
        .map(row => ({
          hour: parseInt(row.hour),
          price: parseFloat(row.avg_price),
        }))
        .sort((a, b) => a.price - b.price)
        .slice(0, 3);

      const optimal = {
        bestTimesToSell: peakHours.map(h => ({
          hour: h.hour,
          timeRange: `${h.hour}:00 - ${h.hour + 1}:00`,
          averagePrice: h.price.toFixed(2),
          volumeIndex: h.volume,
          recommendation: 'High demand, premium prices',
        })),
        bestTimesToBuy: offPeakHours.map(h => ({
          hour: h.hour,
          timeRange: `${h.hour}:00 - ${h.hour + 1}:00`,
          averagePrice: h.price.toFixed(2),
          recommendation: 'Low demand, best prices',
        })),
        generatedAt: new Date(),
      };
      
      // Cache for 4 hours
      await cacheSet(cacheKey, optimal, 4 * 60 * 60);
      
      return optimal;
    } catch (error) {
      logger.error('Error getting optimal trading times:', error);
      throw error;
    }
  }

  /**
   * Calculate dynamic price for a listing based on real-time factors
   */
  async calculateDynamicPrice(userId, energyAmount, duration = 'daily') {
    try {
      const recommendation = await this.getPricingRecommendation(userId);
      
      // Apply volume discount
      let volumeDiscount = 0;
      if (energyAmount > 100) volumeDiscount = 0.05; // 5% off
      if (energyAmount > 500) volumeDiscount = 0.10; // 10% off
      if (energyAmount > 1000) volumeDiscount = 0.15; // 15% off
      
      // Apply duration multiplier
      let durationMultiplier = 1.0;
      if (duration === 'weekly') durationMultiplier = 0.95; // 5% discount
      if (duration === 'monthly') durationMultiplier = 0.90; // 10% discount
      
      const basePrice = recommendation.recommendedPrice;
      const finalPrice = basePrice * (1 - volumeDiscount) * durationMultiplier;
      
      return {
        pricePerKwh: parseFloat(finalPrice.toFixed(2)),
        totalPrice: parseFloat((finalPrice * energyAmount).toFixed(2)),
        breakdown: {
          basePrice: recommendation.recommendedPrice,
          volumeDiscount: volumeDiscount * 100,
          durationDiscount: (1 - durationMultiplier) * 100,
        },
        validUntil: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      };
    } catch (error) {
      logger.error('Error calculating dynamic price:', error);
      throw error;
    }
  }

  // ===== Helper Methods =====

  async _getMarketStatistics() {
    try {
      const result = await db.query(
        `SELECT 
          AVG(price_per_kwh) as avg_price,
          MIN(price_per_kwh) as min_price,
          MAX(price_per_kwh) as max_price,
          COUNT(*) as listing_count
         FROM energy_listings
         WHERE status = 'active' AND created_at >= NOW() - INTERVAL '7 days'`
      );

      if (result.rows.length === 0) {
        return { avgPrice: 5.0, minPrice: 3.0, maxPrice: 10.0, listingCount: 0 };
      }

      const row = result.rows[0];
      return {
        avgPrice: parseFloat(row.avg_price) || 5.0,
        minPrice: parseFloat(row.min_price) || 3.0,
        maxPrice: parseFloat(row.max_price) || 10.0,
        listingCount: parseInt(row.listing_count) || 0,
      };
    } catch (error) {
      logger.error('Error getting market statistics:', error);
      return { avgPrice: 5.0, minPrice: 3.0, maxPrice: 10.0, listingCount: 0 };
    }
  }

  async _getSupplyDemandRatio() {
    try {
      // Get total active supply
      const supplyResult = await db.query(
        `SELECT SUM(energy_amount_kwh) as total_supply
         FROM energy_listings
         WHERE status = 'active'`
      );

      // Estimate demand from recent transactions
      const demandResult = await db.query(
        `SELECT SUM(energy_kwh) as total_demand
         FROM energy_transactions
         WHERE created_at >= NOW() - INTERVAL '7 days'`
      );

      const supply = parseFloat(supplyResult.rows[0]?.total_supply) || 1000;
      const demand = parseFloat(demandResult.rows[0]?.total_demand) || 800;
      
      const ratio = supply / demand;
      const trend = ratio > 1 ? 'oversupply' : ratio < 0.9 ? 'shortage' : 'balanced';
      
      return { ratio, trend, supply, demand };
    } catch (error) {
      logger.error('Error getting supply/demand ratio:', error);
      return { ratio: 1.0, trend: 'balanced', supply: 0, demand: 0 };
    }
  }

  _getTimeOfDayMultiplier() {
    const hour = new Date().getHours();
    
    // Peak hours (6-10 AM, 6-10 PM): Higher prices
    if ((hour >= 6 && hour < 10) || (hour >= 18 && hour < 22)) {
      return 1.15; // 15% premium
    }
    
    // Mid-day (10 AM - 6 PM): Standard prices
    if (hour >= 10 && hour < 18) {
      return 1.0;
    }
    
    // Off-peak (10 PM - 6 AM): Lower prices
    return 0.85; // 15% discount
  }

  async _getUserPricingStrategy(userId) {
    try {
      const result = await db.query(
        `SELECT pricing_preferences FROM hosts WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return { minPrice: null, maxPrice: null };
      }

      const prefs = result.rows[0].pricing_preferences || {};
      return {
        minPrice: prefs.min_price || null,
        maxPrice: prefs.max_price || null,
        strategy: prefs.strategy || 'market',
      };
    } catch (error) {
      logger.error('Error getting user pricing strategy:', error);
      return { minPrice: null, maxPrice: null };
    }
  }

  _calculatePricingConfidence(marketStats, supplyDemand) {
    let confidence = 0.7; // Base confidence
    
    // More listings = higher confidence
    if (marketStats.listingCount > 10) confidence += 0.1;
    if (marketStats.listingCount > 50) confidence += 0.1;
    
    // Balanced supply/demand = higher confidence
    if (supplyDemand.ratio >= 0.9 && supplyDemand.ratio <= 1.1) {
      confidence += 0.1;
    }
    
    return Math.min(0.95, confidence);
  }
}

module.exports = new PricingService();
