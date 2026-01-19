const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../database');
const { cacheSet, cacheGet, cacheDel } = require('../utils/cache');

const ML_MATCHING_URL = process.env.ML_MATCHING_URL || 'http://localhost:8002';

class MatchingService {
  /**
   * Find best sellers for a buyer's energy requirement
   */
  async findSellerMatches(buyerId, requiredKwh, maxPrice, buyerLocation, preferences = {}) {
    try {
      const cacheKey = `match:buyer:${buyerId}`;
      
      // Check cache (5 minute TTL)
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.info(`[CACHE HIT] Buyer matches for ${buyerId}`);
        return cached;
      }

      // Get all active sellers with available energy
      const sellerResult = await db.query(`
        SELECT 
          h.id as seller_id,
          h.user_id,
          u.full_name,
          u.average_rating,
          u.completed_transactions,
          h.solar_capacity_kw,
          h.latitude,
          h.longitude,
          h.city,
          h.state,
          d.device_type,
          l.energy_amount_kwh as available_kwh,
          l.price_per_kwh,
          l.renewable_cert,
          l.created_at
        FROM listings l
        JOIN hosts h ON l.seller_id = h.user_id
        JOIN users u ON h.user_id = u.id
        LEFT JOIN devices d ON h.id = d.host_id
        WHERE l.status = 'active'
          AND l.energy_amount_kwh > 0
          AND l.price_per_kwh <= $1
        LIMIT 50
      `, [maxPrice * 1.15]); // Allow 15% overage

      const sellers = sellerResult.rows.map(row => ({
        id: row.seller_id,
        available_kwh: row.available_kwh,
        price_per_kwh: row.price_per_kwh,
        location: {
          latitude: row.latitude,
          longitude: row.longitude,
          city: row.city,
          state: row.state,
        },
        average_rating: row.average_rating || 3.5,
        completed_transactions: row.completed_transactions || 0,
        device_type: row.device_type || 'solar_meter',
        renewable_certified: row.renewable_cert || false,
      }));

      // Call ML matching service
      const buyer = {
        id: buyerId,
        required_kwh: requiredKwh,
        max_price_per_kwh: maxPrice,
        location: buyerLocation,
        renewable_preference: preferences.renewable || false,
        reliability_threshold: preferences.minRating || 3.0,
      };

      logger.info(`[MATCHING] Finding matches for buyer ${buyerId}: ${requiredKwh}kWh @ ₹${maxPrice}/kWh`);

      const response = await axios.post(
        `${ML_MATCHING_URL}/api/v1/match/find-sellers`,
        {
          buyer,
          available_sellers: sellers,
          top_k: preferences.topK || 5,
        },
        { timeout: 10000 }
      );

      const result = response.data;

      // Store in cache
      await cacheSet(cacheKey, result, 300); // 5 minutes

      return result;

    } catch (error) {
      logger.error('Matching service error:', error.message);
      throw error;
    }
  }

  /**
   * Find best buyers for a seller's available energy
   */
  async findBuyerMatches(sellerId, availableKwh, sellerLocation) {
    try {
      const cacheKey = `match:seller:${sellerId}`;

      // Check cache
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.info(`[CACHE HIT] Seller matches for ${sellerId}`);
        return cached;
      }

      // Get all active buyers
      const buyerResult = await db.query(`
        SELECT DISTINCT
          b.user_id as buyer_id,
          u.full_name,
          u.average_rating,
          u.completed_transactions,
          b.latitude,
          b.longitude,
          b.city,
          b.state
        FROM buyers b
        JOIN users u ON b.user_id = u.id
        WHERE u.role = 'buyer'
        LIMIT 50
      `);

      const buyers = buyerResult.rows.map(row => ({
        id: row.buyer_id,
        required_kwh: 1, // Dynamic based on demand
        max_price_per_kwh: 10,
        location: {
          latitude: row.latitude,
          longitude: row.longitude,
          city: row.city,
          state: row.state,
        },
        average_rating: row.average_rating || 3.5,
        completed_transactions: row.completed_transactions || 0,
      }));

      logger.info(`[MATCHING] Finding buyer matches for seller ${sellerId}: ${availableKwh}kWh available`);

      const response = await axios.post(
        `${ML_MATCHING_URL}/api/v1/match/find-buyers`,
        {
          seller_id: sellerId,
          available_kwh: availableKwh,
          location: sellerLocation,
          buyers,
        },
        { timeout: 10000 }
      );

      const result = response.data;
      await cacheSet(cacheKey, result, 300);

      return result;

    } catch (error) {
      logger.error('Reverse matching error:', error.message);
      throw error;
    }
  }

  /**
   * Create smart allocation based on matches
   */
  async createSmartAllocation(buyerId, matches) {
    try {
      // Start transaction
      const client = await db.pool.connect();
      await client.query('BEGIN');

      const allocations = [];
      let remainingKwh = matches[0]?.buyer.required_kwh || 0;

      // Allocate energy from top matches
      for (const match of matches) {
        if (remainingKwh <= 0) break;

        const allocateKwh = Math.min(match.total_available, remainingKwh);
        const cost = allocateKwh * match.price_per_kwh;

        // Create allocation record
        const result = await client.query(
          `INSERT INTO smart_allocations 
           (buyer_id, seller_id, requested_kwh, allocated_kwh, price_per_kwh, match_score)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [buyerId, match.seller_id, remainingKwh, allocateKwh, match.price_per_kwh, match.match_score]
        );

        allocations.push(result.rows[0]);
        remainingKwh -= allocateKwh;
      }

      await client.query('COMMIT');
      client.release();

      logger.info(`Created ${allocations.length} allocations for buyer ${buyerId}`);

      // Invalidate cache
      await cacheDel(`match:buyer:${buyerId}`);

      return allocations;

    } catch (error) {
      logger.error('Smart allocation error:', error.message);
      throw error;
    }
  }
}

module.exports = new MatchingService();
