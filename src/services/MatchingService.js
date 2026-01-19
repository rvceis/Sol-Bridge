const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../database');
const { cacheSet, cacheGet, cacheDel } = require('../utils/cache');

const ML_MATCHING_URL = process.env.ML_MATCHING_URL || 'http://localhost:8002';
const ML_TIMEOUT = process.env.ML_TIMEOUT || 8000; // 8 seconds max

class MatchingService {
  /**
   * Find best sellers for a buyer's energy requirement
   * OPTIMIZED: Uses indexed queries and faster ML timeout
   */
  async findSellerMatches(buyerId, requiredKwh, maxPrice, buyerLocation, preferences = {}) {
    try {
      const cacheKey = `match:buyer:${buyerId}`;
      
      // Check cache first (5 minute TTL)
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.info(`[CACHE HIT] Buyer matches for ${buyerId}`);
        return cached;
      }

      // Start timing
      const startTime = Date.now();

      // OPTIMIZED QUERY: Use indexed columns, minimal JOINs, LIMIT early
      // Assume indexes on: listings(status, energy_amount_kwh, price_per_kwh)
      //                   hosts(user_id, latitude, longitude)
      //                   users(id, average_rating)
      const sellerResult = await db.query(`
        SELECT 
          h.id as seller_id,
          h.user_id,
          u.full_name,
          u.average_rating,
          u.completed_transactions,
          h.latitude,
          h.longitude,
          h.city,
          l.energy_amount_kwh as available_kwh,
          l.price_per_kwh,
          l.renewable_cert
        FROM listings l
        INNER JOIN hosts h ON l.seller_id = h.user_id
        INNER JOIN users u ON h.user_id = u.id
        WHERE l.status = 'active'
          AND l.energy_amount_kwh > 0.5
          AND l.price_per_kwh <= $1
          AND u.average_rating >= $2
        ORDER BY l.energy_amount_kwh DESC
        LIMIT 30
      `, [maxPrice * 1.2, preferences.minRating || 2.0]); // Faster limit

      const sellers = sellerResult.rows.map(row => ({
        id: row.seller_id,
        seller_name: row.full_name,
        available_kwh: parseFloat(row.available_kwh),
        price_per_kwh: parseFloat(row.price_per_kwh),
        location: {
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          city: row.city,
        },
        rating: parseFloat(row.average_rating || 3.5),
        completed_transactions: row.completed_transactions || 0,
        renewable_cert: row.renewable_cert || false,
      }));

      logger.debug(`[MATCHING] Found ${sellers.length} active sellers in ${Date.now() - startTime}ms`);

      // If no sellers, return early
      if (sellers.length === 0) {
        const emptyResult = { matches: [] };
        await cacheSet(cacheKey, emptyResult, 300);
        return emptyResult;
      }

      // Call ML matching service with timeout
      const buyer = {
        required_kwh: requiredKwh,
        max_price_per_kwh: maxPrice,
        latitude: buyerLocation.latitude,
        longitude: buyerLocation.longitude,
        renewable: preferences.renewable || false,
      };

      logger.info(`[ML_CALL] Matching ${requiredKwh}kWh from ${sellers.length} sellers (${Date.now() - startTime}ms elapsed)`);

      const mlStartTime = Date.now();
      let response;
      
      try {
        response = await axios.post(
          `${ML_MATCHING_URL}/api/v1/match/find-sellers`,
          {
            latitude: buyer.latitude,
            longitude: buyer.longitude,
            required_kwh: buyer.required_kwh,
            max_price: buyer.max_price_per_kwh,
            sellers: sellers,
          },
          { 
            timeout: ML_TIMEOUT,
            maxRedirects: 0,
          }
        );
      } catch (mlError) {
        if (mlError.code === 'ECONNABORTED' || mlError.message.includes('timeout')) {
          logger.warn('[ML_TIMEOUT] ML service slow, returning best fallback');
          // Fallback: return sellers sorted by price
          const sorted = sellers
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 5)
            .map(s => ({
              ...s,
              match_score: 50,
              match_breakdown: {
                availability: 70,
                price: 60,
                reliability: 70,
                distance: 50,
                renewable: s.renewable_cert ? 100 : 50,
                timing: 80,
              },
            }));
          
          const fallbackResult = { matches: sorted };
          await cacheSet(cacheKey, fallbackResult, 60); // Shorter cache for fallback
          return fallbackResult;
        }
        throw mlError;
      }

      logger.debug(`[ML_TIME] ML service responded in ${Date.now() - mlStartTime}ms`);

      const result = {
        matches: response.data.matches || [],
        total_time: Date.now() - startTime,
      };

      // Store in cache (5 minutes)
      await cacheSet(cacheKey, result, 300);

      logger.info(`[MATCH_COMPLETE] Found ${result.matches.length} matches in ${result.total_time}ms`);
      return result;

    } catch (error) {
      logger.error('[MATCHING_ERROR]', error.message);
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
