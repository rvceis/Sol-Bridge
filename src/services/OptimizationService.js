const db = require('../database');
const logger = require('../utils/logger');

/**
 * AI/ML Energy Optimization Service
 * 
 * This service provides intelligent allocation and optimization algorithms for:
 * 1. Optimal seller-buyer matching
 * 2. Dynamic pricing recommendations
 * 3. Energy demand forecasting
 * 4. Grid load balancing
 * 5. Investment opportunity scoring
 */
class OptimizationService {
  
  /**
   * Find optimal energy allocation for a buyer
   * Uses weighted scoring based on:
   * - Distance (closer is better)
   * - Price (lower is better)
   * - Seller rating (higher is better)
   * - Renewable certification (bonus)
   * - Historical reliability
   */
  async findOptimalAllocation(buyerId, energyNeeded, userLatitude, userLongitude, preferences = {}) {
    try {
      const {
        maxDistance = 100, // km
        maxPrice = null,
        preferRenewable = true,
        minSellerRating = 0,
      } = preferences;

      const radiusDegrees = maxDistance / 111;

      // Get all available listings with scoring factors
      const result = await db.query(`
        SELECT 
          l.id as listing_id,
          l.seller_id,
          l.energy_amount_kwh,
          l.price_per_kwh,
          l.renewable_cert,
          l.min_purchase_kwh,
          l.available_from,
          l.available_to,
          u.full_name as seller_name,
          ua.latitude,
          ua.longitude,
          ua.city,
          
          -- Distance calculation
          SQRT(
            POWER(COALESCE(l.location_latitude, ua.latitude) - $3, 2) + 
            POWER(COALESCE(l.location_longitude, ua.longitude) - $4, 2)
          ) * 111 as distance_km,
          
          -- Seller metrics
          (
            SELECT COALESCE(AVG(t.rating), 3.0) 
            FROM energy_transactions t 
            WHERE t.seller_id = l.seller_id AND t.rating IS NOT NULL
          ) as seller_rating,
          (
            SELECT COUNT(*) 
            FROM energy_transactions t 
            WHERE t.seller_id = l.seller_id AND t.status = 'completed'
          ) as completed_transactions,
          (
            SELECT COUNT(*) 
            FROM energy_transactions t 
            WHERE t.seller_id = l.seller_id AND t.status = 'cancelled'
          ) as cancelled_transactions
          
        FROM energy_listings l
        JOIN users u ON l.seller_id = u.id
        LEFT JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_primary = true
        WHERE l.status = 'active'
          AND l.available_to > NOW()
          AND l.seller_id != $1
          AND l.energy_amount_kwh >= l.min_purchase_kwh
          AND (ua.latitude BETWEEN $3 - $5 AND $3 + $5)
          AND (ua.longitude BETWEEN $4 - $5 AND $4 + $5)
        ORDER BY l.price_per_kwh ASC
      `, [buyerId, energyNeeded, userLatitude, userLongitude, radiusDegrees]);

      const listings = result.rows;

      // Score and rank listings
      const scoredListings = listings.map(listing => {
        let score = 0;
        
        // Distance score (0-25 points, closer is better)
        const distanceScore = Math.max(0, 25 - (listing.distance_km / maxDistance) * 25);
        score += distanceScore;
        
        // Price score (0-30 points, cheaper is better)
        const avgPrice = listings.reduce((sum, l) => sum + parseFloat(l.price_per_kwh), 0) / listings.length;
        const priceScore = Math.max(0, 30 - ((parseFloat(listing.price_per_kwh) / avgPrice) - 0.5) * 30);
        score += priceScore;
        
        // Rating score (0-20 points)
        const ratingScore = (parseFloat(listing.seller_rating) / 5) * 20;
        score += ratingScore;
        
        // Reliability score (0-15 points)
        const totalTransactions = listing.completed_transactions + listing.cancelled_transactions;
        const reliabilityRate = totalTransactions > 0 
          ? listing.completed_transactions / totalTransactions 
          : 0.5;
        score += reliabilityRate * 15;
        
        // Renewable bonus (0-10 points)
        if (listing.renewable_cert && preferRenewable) {
          score += 10;
        }

        return {
          ...listing,
          score: Math.round(score * 100) / 100,
          distance_km: Math.round(listing.distance_km * 100) / 100,
          factors: {
            distance: Math.round(distanceScore * 100) / 100,
            price: Math.round(priceScore * 100) / 100,
            rating: Math.round(ratingScore * 100) / 100,
            reliability: Math.round(reliabilityRate * 15 * 100) / 100,
            renewable: listing.renewable_cert && preferRenewable ? 10 : 0,
          }
        };
      });

      // Sort by score descending
      scoredListings.sort((a, b) => b.score - a.score);

      // Optimal allocation algorithm
      let remainingEnergy = energyNeeded;
      const allocation = [];
      
      for (const listing of scoredListings) {
        if (remainingEnergy <= 0) break;
        
        const availableEnergy = parseFloat(listing.energy_amount_kwh);
        const minPurchase = parseFloat(listing.min_purchase_kwh);
        
        if (availableEnergy < minPurchase) continue;
        
        const allocatedEnergy = Math.min(remainingEnergy, availableEnergy);
        
        if (allocatedEnergy >= minPurchase) {
          allocation.push({
            listing_id: listing.listing_id,
            seller_id: listing.seller_id,
            seller_name: listing.seller_name,
            energy_kwh: allocatedEnergy,
            price_per_kwh: parseFloat(listing.price_per_kwh),
            total_price: allocatedEnergy * parseFloat(listing.price_per_kwh),
            distance_km: listing.distance_km,
            score: listing.score,
            renewable_cert: listing.renewable_cert,
            city: listing.city,
          });
          remainingEnergy -= allocatedEnergy;
        }
      }

      const totalCost = allocation.reduce((sum, a) => sum + a.total_price, 0);
      const totalEnergy = allocation.reduce((sum, a) => sum + a.energy_kwh, 0);
      const platformFee = totalCost * 0.05;

      return {
        success: remainingEnergy <= 0,
        requested_energy: energyNeeded,
        allocated_energy: totalEnergy,
        remaining_energy: Math.max(0, remainingEnergy),
        allocation,
        summary: {
          total_cost: Math.round(totalCost * 100) / 100,
          platform_fee: Math.round(platformFee * 100) / 100,
          grand_total: Math.round((totalCost + platformFee) * 100) / 100,
          average_price_per_kwh: allocation.length > 0 
            ? Math.round((totalCost / totalEnergy) * 100) / 100 
            : 0,
          num_sellers: allocation.length,
          avg_distance_km: allocation.length > 0
            ? Math.round((allocation.reduce((sum, a) => sum + a.distance_km, 0) / allocation.length) * 100) / 100
            : 0,
        }
      };
    } catch (error) {
      logger.error('Error in findOptimalAllocation:', error);
      throw error;
    }
  }

  /**
   * Get dynamic pricing recommendation for sellers
   * Based on:
   * - Current market prices
   * - Demand in area
   * - Time of day/season
   * - Seller's history
   */
  async getPricingRecommendation(sellerId, energyAmount, latitude, longitude) {
    try {
      const radiusDegrees = 50 / 111; // 50km radius

      // Get market data
      const marketData = await db.query(`
        SELECT 
          AVG(price_per_kwh) as avg_price,
          MIN(price_per_kwh) as min_price,
          MAX(price_per_kwh) as max_price,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_kwh) as p25_price,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_kwh) as p75_price,
          COUNT(*) as listing_count,
          SUM(energy_amount_kwh) as total_supply
        FROM energy_listings l
        LEFT JOIN user_addresses ua ON l.seller_id = ua.user_id AND ua.is_primary = true
        WHERE l.status = 'active'
          AND l.available_to > NOW()
          AND (ua.latitude BETWEEN $1 - $3 AND $1 + $3)
          AND (ua.longitude BETWEEN $2 - $3 AND $2 + $3)
      `, [latitude, longitude, radiusDegrees]);

      // Get recent transaction data
      const transactionData = await db.query(`
        SELECT 
          AVG(price_per_kwh) as avg_transaction_price,
          COUNT(*) as transaction_count
        FROM energy_transactions t
        JOIN energy_listings l ON t.listing_id = l.id
        LEFT JOIN user_addresses ua ON l.seller_id = ua.user_id AND ua.is_primary = true
        WHERE t.created_at > NOW() - INTERVAL '7 days'
          AND t.status = 'completed'
          AND (ua.latitude BETWEEN $1 - $3 AND $1 + $3)
          AND (ua.longitude BETWEEN $2 - $3 AND $2 + $3)
      `, [latitude, longitude, radiusDegrees]);

      // Get seller's history
      const sellerHistory = await db.query(`
        SELECT 
          AVG(l.price_per_kwh) as avg_listing_price,
          COUNT(*) as total_listings,
          (
            SELECT COUNT(*) FROM energy_transactions t 
            WHERE t.seller_id = $1 AND t.status = 'completed'
          ) as completed_sales
        FROM energy_listings l
        WHERE l.seller_id = $1
      `, [sellerId]);

      const market = marketData.rows[0];
      const transactions = transactionData.rows[0];
      const seller = sellerHistory.rows[0];

      // Calculate recommended price
      const avgMarketPrice = parseFloat(market.avg_price) || 8.0;
      const avgTransactionPrice = parseFloat(transactions.avg_transaction_price) || avgMarketPrice;
      
      // Supply-demand factor
      const supplyDemandRatio = parseFloat(market.total_supply) / (parseFloat(transactions.transaction_count) || 1);
      const demandFactor = supplyDemandRatio > 100 ? 0.95 : supplyDemandRatio < 20 ? 1.10 : 1.0;

      // Experience factor
      const experienceFactor = parseInt(seller.completed_sales) > 10 ? 1.05 : 1.0;

      // Calculate recommendations
      const basePrice = (avgMarketPrice + avgTransactionPrice) / 2;
      const recommendedPrice = basePrice * demandFactor * experienceFactor;

      return {
        recommended_price: Math.round(recommendedPrice * 100) / 100,
        price_range: {
          min: Math.round(parseFloat(market.min_price || recommendedPrice * 0.8) * 100) / 100,
          max: Math.round(parseFloat(market.max_price || recommendedPrice * 1.2) * 100) / 100,
          competitive: Math.round(parseFloat(market.p25_price || recommendedPrice * 0.9) * 100) / 100,
        },
        market_insights: {
          avg_market_price: Math.round(avgMarketPrice * 100) / 100,
          avg_transaction_price: Math.round(avgTransactionPrice * 100) / 100,
          active_listings: parseInt(market.listing_count) || 0,
          total_supply_kwh: Math.round(parseFloat(market.total_supply) || 0),
          recent_transactions: parseInt(transactions.transaction_count) || 0,
        },
        factors: {
          demand_adjustment: Math.round((demandFactor - 1) * 100) + '%',
          experience_bonus: Math.round((experienceFactor - 1) * 100) + '%',
        },
        estimated_earnings: {
          at_recommended: Math.round(energyAmount * recommendedPrice * 0.95 * 100) / 100,
          at_competitive: Math.round(energyAmount * parseFloat(market.p25_price || recommendedPrice * 0.9) * 0.95 * 100) / 100,
        }
      };
    } catch (error) {
      logger.error('Error in getPricingRecommendation:', error);
      throw error;
    }
  }

  /**
   * Score investment opportunities
   * For investors looking to fund solar installations
   */
  async scoreInvestmentOpportunities(investorId, latitude, longitude, budget) {
    try {
      const radiusDegrees = 100 / 111;

      // Find potential hosts (users without devices but with good profiles)
      const opportunities = await db.query(`
        SELECT 
          u.id as user_id,
          u.full_name,
          u.kyc_status,
          u.created_at as member_since,
          ua.city,
          ua.state,
          ua.latitude,
          ua.longitude,
          SQRT(
            POWER(ua.latitude - $2, 2) + 
            POWER(ua.longitude - $3, 2)
          ) * 111 as distance_km,
          (
            SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id
          ) as existing_devices,
          (
            SELECT COALESCE(AVG(t.rating), 0)
            FROM energy_transactions t 
            WHERE t.buyer_id = u.id AND t.rating IS NOT NULL
          ) as buyer_rating,
          (
            SELECT COUNT(*)
            FROM energy_transactions t 
            WHERE t.buyer_id = u.id
          ) as purchase_history
        FROM users u
        JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_primary = true
        WHERE u.id != $1
          AND u.kyc_status = 'verified'
          AND ua.latitude BETWEEN $2 - $4 AND $2 + $4
          AND ua.longitude BETWEEN $3 - $4 AND $3 + $4
        ORDER BY distance_km ASC
        LIMIT 50
      `, [investorId, latitude, longitude, radiusDegrees]);

      // Score each opportunity
      const scoredOpportunities = opportunities.rows.map(opp => {
        let score = 0;
        
        // Distance score (0-20)
        score += Math.max(0, 20 - (opp.distance_km / 100) * 20);
        
        // KYC verification (20 points)
        score += 20;
        
        // Purchase history (0-25)
        const historyScore = Math.min(25, opp.purchase_history * 2.5);
        score += historyScore;
        
        // Buyer rating (0-20)
        score += (parseFloat(opp.buyer_rating) / 5) * 20;
        
        // New to solar bonus (prefer users without devices) (0-15)
        score += opp.existing_devices === 0 ? 15 : Math.max(0, 15 - opp.existing_devices * 3);

        // Estimate potential ROI (simplified)
        const avgEnergyOutput = 1200; // kWh per year per kW installed
        const avgPrice = 8; // ₹ per kWh
        const estimatedAnnualRevenue = avgEnergyOutput * avgPrice;
        const estimatedROI = (estimatedAnnualRevenue / (budget * 0.2)) * 100; // Assuming 20% of budget per installation

        return {
          user_id: opp.user_id,
          name: opp.full_name,
          city: opp.city,
          state: opp.state,
          distance_km: Math.round(opp.distance_km * 100) / 100,
          score: Math.round(score * 100) / 100,
          existing_devices: opp.existing_devices,
          purchase_history: opp.purchase_history,
          buyer_rating: parseFloat(opp.buyer_rating) || 0,
          member_since: opp.member_since,
          estimated_annual_roi: Math.round(estimatedROI * 100) / 100 + '%',
        };
      });

      scoredOpportunities.sort((a, b) => b.score - a.score);

      return {
        opportunities: scoredOpportunities.slice(0, 20),
        summary: {
          total_found: scoredOpportunities.length,
          avg_score: Math.round(
            (scoredOpportunities.reduce((sum, o) => sum + o.score, 0) / scoredOpportunities.length || 0) * 100
          ) / 100,
          budget: budget,
          estimated_installations: Math.floor(budget / 50000), // Assuming ₹50k per installation
        }
      };
    } catch (error) {
      logger.error('Error in scoreInvestmentOpportunities:', error);
      throw error;
    }
  }

  /**
   * Predict energy demand for an area
   * Simple forecasting based on historical data
   */
  async predictDemand(latitude, longitude, days = 7) {
    try {
      const radiusDegrees = 50 / 111;

      // Get historical transaction data (30 days)
      const historicalData = await db.query(`
        SELECT 
          DATE(t.created_at) as transaction_date,
          EXTRACT(DOW FROM t.created_at) as day_of_week,
          EXTRACT(MONTH FROM t.created_at) as month,
          SUM(t.energy_amount_kwh) as total_energy,
          COUNT(*) as transaction_count,
          AVG(t.price_per_kwh) as avg_price,
          AVG(t.rating) as avg_rating
        FROM energy_transactions t
        JOIN energy_listings l ON t.listing_id = l.id
        LEFT JOIN user_addresses ua ON l.seller_id = ua.user_id AND ua.is_default = true
        WHERE t.created_at > NOW() - INTERVAL '60 days'
          AND (ua.latitude BETWEEN $1 - $3 AND $1 + $3)
          AND (ua.longitude BETWEEN $2 - $3 AND $2 + $3)
        GROUP BY DATE(t.created_at), EXTRACT(DOW FROM t.created_at), EXTRACT(MONTH FROM t.created_at)
        ORDER BY transaction_date
      `, [latitude, longitude, radiusDegrees]);

      if (historicalData.rows.length === 0) {
        // Fallback if no data
        return {
          predictions: Array.from({ length: days }, (_, i) => ({
            date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
            day_name: new Date(Date.now() + i * 86400000).toLocaleDateString('en-US', { weekday: 'long' }),
            predicted_demand_kwh: 50,
            predicted_transactions: 5,
            predicted_avg_price: 6.0,
            confidence: 'low',
            trend: 'insufficient_data'
          })),
          model_info: {
            based_on_days: 0,
            data_points: 0,
            methodology: 'Fallback baseline (insufficient historical data)',
          }
        };
      }

      // Calculate statistics by day of week
      const dayOfWeekStats = {};
      let totalEnergy = 0, totalTransactions = 0, totalPrice = 0, priceCount = 0;

      historicalData.rows.forEach(row => {
        const dow = parseInt(row.day_of_week);
        if (!dayOfWeekStats[dow]) {
          dayOfWeekStats[dow] = { energy: [], count: [], price: [], ratings: [] };
        }
        dayOfWeekStats[dow].energy.push(parseFloat(row.total_energy) || 0);
        dayOfWeekStats[dow].count.push(parseInt(row.transaction_count) || 0);
        if (row.avg_price) {
          dayOfWeekStats[dow].price.push(parseFloat(row.avg_price));
          totalPrice += parseFloat(row.avg_price);
          priceCount++;
        }
        if (row.avg_rating) {
          dayOfWeekStats[dow].ratings.push(parseFloat(row.avg_rating));
        }
        totalEnergy += parseFloat(row.total_energy) || 0;
        totalTransactions += parseInt(row.transaction_count) || 0;
      });

      const overallAvgPrice = priceCount > 0 ? totalPrice / priceCount : 6.0;
      const overallAvgEnergy = historicalData.rows.length > 0 ? totalEnergy / historicalData.rows.length : 50;

      // Generate predictions with trend analysis
      const predictions = [];
      const today = new Date();
      let prevDemand = overallAvgEnergy;

      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dow = date.getDay();

        const stats = dayOfWeekStats[dow] || { energy: [], count: [], price: [], ratings: [] };
        
        // Calculate averages
        const avgEnergy = stats.energy.length > 0 
          ? stats.energy.reduce((a, b) => a + b, 0) / stats.energy.length 
          : overallAvgEnergy;
        const avgCount = stats.count.length > 0 
          ? Math.ceil(stats.count.reduce((a, b) => a + b, 0) / stats.count.length) 
          : 5;
        const avgPrice = stats.price.length > 0 
          ? stats.price.reduce((a, b) => a + b, 0) / stats.price.length 
          : overallAvgPrice;

        // Calculate trend (simple: compare to previous day)
        let trend = 'stable';
        if (avgEnergy > prevDemand * 1.15) trend = 'increasing';
        else if (avgEnergy < prevDemand * 0.85) trend = 'decreasing';

        // Confidence based on data samples
        let confidence = 'low';
        if (stats.energy.length >= 6) confidence = 'high';
        else if (stats.energy.length >= 3) confidence = 'medium';

        predictions.push({
          date: date.toISOString().split('T')[0],
          day_name: date.toLocaleDateString('en-US', { weekday: 'long' }),
          predicted_demand_kwh: Math.round(avgEnergy * 100) / 100,
          predicted_transactions: avgCount,
          predicted_avg_price: Math.round(avgPrice * 100) / 100,
          confidence,
          trend,
          data_samples: stats.energy.length
        });

        prevDemand = avgEnergy;
      }

      return {
        predictions,
        model_info: {
          based_on_days: 60,
          data_points: historicalData.rows.length,
          methodology: 'Day-of-week statistical averaging with trend analysis',
          overall_avg_demand_kwh: Math.round(overallAvgEnergy * 100) / 100,
          overall_avg_price: Math.round(overallAvgPrice * 100) / 100,
        }
      };
    } catch (error) {
      logger.error('Error in predictDemand:', error);
      throw error;
    }
  }

  /**
   * Get seller reliability metrics
   * Calculates: completion rate, response time, avg rating
   */
  async getSellerReliability(sellerId) {
    try {
      const result = await db.query(`
        SELECT
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
          COUNT(CASE WHEN status = 'disputed' THEN 1 END) as disputed,
          COUNT(*) as total_transactions,
          COALESCE(AVG(rating), 0) as avg_rating,
          COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600), 0) as avg_completion_hours,
          MIN(created_at) as seller_since
        FROM energy_transactions
        WHERE seller_id = $1
      `, [sellerId]);

      const data = result.rows[0];
      const completionRate = data.total_transactions > 0 
        ? (data.completed / data.total_transactions) * 100 
        : 0;
      const cancellationRate = data.total_transactions > 0 
        ? (data.cancelled / data.total_transactions) * 100 
        : 0;

      // Reliability score: 0-100
      let reliabilityScore = 0;
      reliabilityScore += completionRate * 0.6; // 60% weight on completion
      reliabilityScore += (100 - cancellationRate * 5) * 0.2; // 20% weight on low cancellation
      reliabilityScore += (data.avg_rating / 5) * 100 * 0.2; // 20% weight on rating

      return {
        reliability_score: Math.round(reliabilityScore * 100) / 100,
        completion_rate: Math.round(completionRate * 100) / 100,
        cancellation_rate: Math.round(cancellationRate * 100) / 100,
        dispute_rate: data.total_transactions > 0 ? Math.round((data.disputed / data.total_transactions) * 100 * 100) / 100 : 0,
        avg_rating: Math.round(data.avg_rating * 100) / 100,
        avg_completion_hours: Math.round(data.avg_completion_hours * 10) / 10,
        total_transactions: data.total_transactions,
        seller_since: data.seller_since
      };
    } catch (error) {
      logger.error('Error in getSellerReliability:', error);
      throw error;
    }
  }

  /**
   * Get demand clustering by location
   * Identifies hotspots of high demand
   */
  async getLocationDemandClusters(limit = 10) {
    try {
      const result = await db.query(`
        SELECT
          ROUND(ua.latitude::numeric, 1) as lat_cluster,
          ROUND(ua.longitude::numeric, 1) as lng_cluster,
          ua.city,
          ua.state,
          COUNT(t.id) as transaction_count,
          SUM(t.energy_amount_kwh) as total_energy_kwh,
          AVG(t.price_per_kwh) as avg_price,
          COUNT(DISTINCT t.buyer_id) as unique_buyers,
          COUNT(DISTINCT t.seller_id) as unique_sellers
        FROM energy_transactions t
        JOIN energy_listings l ON t.listing_id = l.id
        JOIN users u ON l.seller_id = u.id
        JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_default = true
        WHERE t.created_at > NOW() - INTERVAL '30 days'
          AND ua.latitude IS NOT NULL
          AND ua.longitude IS NOT NULL
        GROUP BY ROUND(ua.latitude::numeric, 1), ROUND(ua.longitude::numeric, 1), ua.city, ua.state
        ORDER BY transaction_count DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => ({
        location: {
          city: row.city,
          state: row.state,
          approximate_lat: row.lat_cluster,
          approximate_lng: row.lng_cluster
        },
        metrics: {
          transaction_count: row.transaction_count,
          total_energy_kwh: Math.round(row.total_energy_kwh * 100) / 100,
          avg_price_per_kwh: Math.round(row.avg_price * 100) / 100,
          unique_buyers: row.unique_buyers,
          unique_sellers: row.unique_sellers,
          buyer_seller_ratio: (row.unique_buyers / row.unique_sellers).toFixed(2)
        },
        demand_level: row.transaction_count >= 20 ? 'very_high' : row.transaction_count >= 10 ? 'high' : row.transaction_count >= 5 ? 'medium' : 'low'
      }));
    } catch (error) {
      logger.error('Error in getLocationDemandClusters:', error);
      throw error;
    }
  }
}

module.exports = new OptimizationService();
