const db = require('../database');
const logger = require('../utils/logger');
const PushNotificationService = require('./PushNotificationService');
const ReportService = require('./ReportService');

class MarketplaceService {
  // Create energy listing
  async createListing(userId, listingData) {
    try {
      const {
        device_id,
        energy_amount_kwh,
        price_per_kwh,
        available_from,
        available_to,
        listing_type = 'spot',
        min_purchase_kwh = 1.0,
        location_latitude,
        location_longitude,
        renewable_cert = true,
        description
      } = listingData;

      const result = await db.query(`
        INSERT INTO energy_listings (
          seller_id, device_id, energy_amount_kwh, price_per_kwh,
          available_from, available_to, listing_type, min_purchase_kwh,
          location_latitude, location_longitude, renewable_cert, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [userId, device_id, energy_amount_kwh, price_per_kwh, available_from, available_to, listing_type, min_purchase_kwh, location_latitude, location_longitude, renewable_cert, description]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating listing:', error);
      throw error;
    }
  }

  // Get all active listings with filters
  async getListings(filters = {}) {
    try {
      const {
        min_price,
        max_price,
        min_energy,
        max_energy,
        listing_type,
        renewable_only,
        seller_id,
        limit = 50,
        offset = 0
      } = filters;

      let query = `
        SELECT 
          l.*,
          u.full_name as seller_name,
          u.kyc_status as seller_kyc_status,
          d.device_type,
          d.device_model
        FROM energy_listings l
        JOIN users u ON l.seller_id = u.id
        LEFT JOIN devices d ON l.device_id = d.device_id
        WHERE l.status = 'active'
          AND l.available_to > NOW()
      `;

      const params = [];
      let paramCount = 1;

      if (min_price) {
        query += ` AND l.price_per_kwh >= $${paramCount}`;
        params.push(min_price);
        paramCount++;
      }

      if (max_price) {
        query += ` AND l.price_per_kwh <= $${paramCount}`;
        params.push(max_price);
        paramCount++;
      }

      if (min_energy) {
        query += ` AND l.energy_amount_kwh >= $${paramCount}`;
        params.push(min_energy);
        paramCount++;
      }

      if (max_energy) {
        query += ` AND l.energy_amount_kwh <= $${paramCount}`;
        params.push(max_energy);
        paramCount++;
      }

      if (listing_type) {
        query += ` AND l.listing_type = $${paramCount}`;
        params.push(listing_type);
        paramCount++;
      }

      if (renewable_only) {
        query += ` AND l.renewable_cert = TRUE`;
      }

      if (seller_id) {
        query += ` AND l.seller_id = $${paramCount}`;
        params.push(seller_id);
        paramCount++;
      }

      query += ` ORDER BY l.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting listings:', error);
      throw error;
    }
  }

  // Get listing by ID
  async getListingById(listingId) {
    try {
      // Increment view count
      await db.query(`
        UPDATE energy_listings
        SET views_count = views_count + 1
        WHERE id = $1
      `, [listingId]);

      const result = await db.query(`
        SELECT 
          l.*,
          u.full_name as seller_name,
          u.email as seller_email,
          u.phone as seller_phone,
          u.kyc_status as seller_kyc_status,
          d.device_type,
          d.device_model,
          d.firmware_version,
          d.status as device_status
        FROM energy_listings l
        JOIN users u ON l.seller_id = u.id
        LEFT JOIN devices d ON l.device_id = d.device_id
        WHERE l.id = $1
      `, [listingId]);

      if (result.rows.length === 0) {
        throw new Error('Listing not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting listing:', error);
      throw error;
    }
  }

  // Update listing
  async updateListing(userId, listingId, updates) {
    try {
      const allowedFields = ['energy_amount_kwh', 'price_per_kwh', 'available_from', 'available_to', 'description', 'status'];
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No valid fields to update');
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId, listingId);

      const query = `
        UPDATE energy_listings
        SET ${fields.join(', ')}
        WHERE seller_id = $${paramCount} AND id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Listing not found or unauthorized');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating listing:', error);
      throw error;
    }
  }

  // Delete/Cancel listing
  async deleteListing(userId, listingId) {
    try {
      const result = await db.query(`
        UPDATE energy_listings
        SET status = 'cancelled', updated_at = NOW()
        WHERE seller_id = $1 AND id = $2 AND status = 'active'
        RETURNING id
      `, [userId, listingId]);

      if (result.rows.length === 0) {
        throw new Error('Listing not found, unauthorized, or already cancelled');
      }

      return { success: true, id: listingId };
    } catch (error) {
      logger.error('Error deleting listing:', error);
      throw error;
    }
  }

  // Create transaction (buy energy)
  async createTransaction(buyerId, transactionData) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        listing_id,
        energy_amount_kwh,
        payment_method_id
      } = transactionData;

      // Get listing details
      const listingResult = await client.query(`
        SELECT * FROM energy_listings
        WHERE id = $1 AND status = 'active'
        FOR UPDATE
      `, [listing_id]);

      if (listingResult.rows.length === 0) {
        throw new Error('Listing not found or no longer available');
      }

      const listing = listingResult.rows[0];

      // Validate purchase amount
      if (energy_amount_kwh < listing.min_purchase_kwh) {
        throw new Error(`Minimum purchase is ${listing.min_purchase_kwh} kWh`);
      }

      if (energy_amount_kwh > listing.energy_amount_kwh) {
        throw new Error(`Only ${listing.energy_amount_kwh} kWh available`);
      }

      // Prevent self-purchase
      if (buyerId === listing.seller_id) {
        throw new Error('Cannot buy your own listing');
      }

      // Calculate prices
      const price_per_kwh = listing.price_per_kwh;
      const subtotal = parseFloat(energy_amount_kwh) * parseFloat(price_per_kwh);
      const platform_fee = subtotal * 0.05; // 5% platform fee
      const total_price = subtotal + platform_fee;

      // Create transaction
      const transactionResult = await client.query(`
        INSERT INTO energy_transactions (
          listing_id, buyer_id, seller_id, energy_amount_kwh,
          price_per_kwh, total_price, platform_fee, payment_method_id,
          delivery_start, delivery_end
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        listing_id,
        buyerId,
        listing.seller_id,
        energy_amount_kwh,
        price_per_kwh,
        total_price,
        platform_fee,
        payment_method_id,
        listing.available_from,
        listing.available_to
      ]);

      const transaction = transactionResult.rows[0];

      // Update listing
      const remaining_energy = parseFloat(listing.energy_amount_kwh) - parseFloat(energy_amount_kwh);
      
      if (remaining_energy <= 0) {
        // Mark listing as sold
        await client.query(`
          UPDATE energy_listings
          SET energy_amount_kwh = 0, status = 'sold', updated_at = NOW()
          WHERE id = $1
        `, [listing_id]);
        
        // Send notification to seller (listing sold out)
        PushNotificationService.notifyListingSold(
          listing.seller_id,
          listing_id,
          energy_amount_kwh,
          total_price
        ).catch(err => logger.error('Failed to send sold notification:', err));
      } else {
        // Update remaining energy
        await client.query(`
          UPDATE energy_listings
          SET energy_amount_kwh = $1, updated_at = NOW()
          WHERE id = $2
        `, [remaining_energy, listing_id]);
      }
      
      // Send payment received notification to seller
      const buyerResult = await client.query('SELECT full_name FROM users WHERE id = $1', [buyerId]);
      const buyerName = buyerResult.rows[0]?.full_name || 'A buyer';
      
      PushNotificationService.notifyPaymentReceived(
        listing.seller_id,
        total_price,
        buyerName
      ).catch(err => logger.error('Failed to send payment notification:', err));

      await client.query('COMMIT');
      
      // Generate transaction report asynchronously (don't wait for it)
      ReportService.generateTransactionReport(transaction.id)
        .then(report => {
          logger.info(`✓ Transaction report generated: ${report.files.csv}`);
        })
        .catch(err => {
          logger.error('Failed to generate transaction report:', err);
        });
      
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating transaction:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Get user transactions
  async getUserTransactions(userId, role = 'buyer') {
    try {
      const field = role === 'buyer' ? 'buyer_id' : 'seller_id';
      
      const result = await db.query(`
        SELECT 
          t.*,
          l.description as listing_description,
          buyer.full_name as buyer_name,
          seller.full_name as seller_name
        FROM energy_transactions t
        JOIN energy_listings l ON t.listing_id = l.id
        JOIN users buyer ON t.buyer_id = buyer.id
        JOIN users seller ON t.seller_id = seller.id
        WHERE t.${field} = $1
        ORDER BY t.created_at DESC
      `, [userId]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting user transactions:', error);
      throw error;
    }
  }

  // Get transaction by ID
  async getTransactionById(transactionId, userId) {
    try {
      const result = await db.query(`
        SELECT 
          t.*,
          l.description as listing_description,
          l.listing_type,
          buyer.full_name as buyer_name,
          buyer.email as buyer_email,
          seller.full_name as seller_name,
          seller.email as seller_email,
          pm.method_type as payment_method_type
        FROM energy_transactions t
        JOIN energy_listings l ON t.listing_id = l.id
        JOIN users buyer ON t.buyer_id = buyer.id
        JOIN users seller ON t.seller_id = seller.id
        LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
        WHERE t.id = $1 AND (t.buyer_id = $2 OR t.seller_id = $2)
      `, [transactionId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Transaction not found or unauthorized');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting transaction:', error);
      throw error;
    }
  }

  // Update transaction status
  async updateTransactionStatus(transactionId, userId, updates) {
    try {
      const { status, payment_status, delivery_status, rating, review } = updates;

      const allowedFields = [];
      const values = [];
      let paramCount = 1;

      if (status) {
        allowedFields.push(`status = $${paramCount}`);
        values.push(status);
        paramCount++;
      }

      if (payment_status) {
        allowedFields.push(`payment_status = $${paramCount}`);
        values.push(payment_status);
        paramCount++;
      }

      if (delivery_status) {
        allowedFields.push(`delivery_status = $${paramCount}`);
        values.push(delivery_status);
        paramCount++;
      }

      if (rating) {
        allowedFields.push(`rating = $${paramCount}`);
        values.push(rating);
        paramCount++;
      }

      if (review) {
        allowedFields.push(`review = $${paramCount}`);
        values.push(review);
        paramCount++;
      }

      if (allowedFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      allowedFields.push(`updated_at = NOW()`);
      values.push(transactionId, userId);

      const query = `
        UPDATE energy_transactions
        SET ${allowedFields.join(', ')}
        WHERE id = $${paramCount} AND (buyer_id = $${paramCount + 1} OR seller_id = $${paramCount + 1})
        RETURNING *
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Transaction not found or unauthorized');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating transaction status:', error);
      throw error;
    }
  }

  // Get market statistics
  async getMarketStatistics(days = 30) {
    try {
      const result = await db.query(`
        SELECT 
          stat_date,
          total_listings,
          active_listings,
          total_transactions,
          total_energy_traded_kwh,
          total_value,
          avg_price_per_kwh,
          min_price_per_kwh,
          max_price_per_kwh,
          unique_buyers,
          unique_sellers
        FROM market_statistics
        WHERE stat_date >= CURRENT_DATE - $1
        ORDER BY stat_date DESC
      `, [days]);

      // Also get current day statistics
      const todayStats = await this.calculateTodayStatistics();

      return {
        historical: result.rows,
        today: todayStats
      };
    } catch (error) {
      logger.error('Error getting market statistics:', error);
      throw error;
    }
  }

  // Calculate today's statistics
  async calculateTodayStatistics() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(DISTINCT l.id) as total_listings,
          COUNT(DISTINCT CASE WHEN l.status = 'active' THEN l.id END) as active_listings,
          COUNT(DISTINCT t.id) as total_transactions,
          COALESCE(SUM(t.energy_amount_kwh), 0) as total_energy_traded_kwh,
          COALESCE(SUM(t.total_price), 0) as total_value,
          COALESCE(AVG(t.price_per_kwh), 0) as avg_price_per_kwh,
          COALESCE(MIN(t.price_per_kwh), 0) as min_price_per_kwh,
          COALESCE(MAX(t.price_per_kwh), 0) as max_price_per_kwh,
          COUNT(DISTINCT t.buyer_id) as unique_buyers,
          COUNT(DISTINCT t.seller_id) as unique_sellers
        FROM energy_listings l
        LEFT JOIN energy_transactions t ON l.id = t.listing_id
          AND DATE(t.created_at) = CURRENT_DATE
        WHERE DATE(l.created_at) <= CURRENT_DATE
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Error calculating today statistics:', error);
      throw error;
    }
  }

  // Get user preferences for AI matching
  async getUserPreferences(userId) {
    try {
      const result = await db.query(`
        SELECT 
          u.id,
          u.role,
          u.full_name,
          COALESCE(AVG(t.energy_amount_kwh), 0) as avg_energy_kwh,
          COALESCE(AVG(t.price_per_kwh), 0) as preferred_price,
          COUNT(t.id) as transaction_count
        FROM users u
        LEFT JOIN energy_transactions t ON u.id = t.buyer_id OR u.id = t.seller_id
        WHERE u.id = $1
        GROUP BY u.id, u.role, u.full_name
      `, [userId]);

      return result.rows[0] || { id: userId, transaction_count: 0 };
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      return { id: userId, transaction_count: 0 };
    }
  }

  // Fallback matching when ML service unavailable
  async getFallbackMatches(userId, userRole) {
    try {
      // Get user's location if available
      const userQuery = await db.query(
        'SELECT latitude, longitude FROM users WHERE id = $1',
        [userId]
      );

      const userLocation = userQuery.rows[0];

      let matches = [];

      if (userRole === 'buyer') {
        // Find sellers with active listings
        const result = await db.query(`
          SELECT 
            u.id as partner_id,
            u.full_name as partner_name,
            u.city || ', ' || u.state as partner_location,
            l.id as listing_id,
            l.energy_amount_kwh as estimated_energy_kwh,
            l.price_per_kwh as suggested_price,
            COALESCE(
              ST_Distance(
                ST_MakePoint($2, $3)::geography,
                ST_MakePoint(u.longitude, u.latitude)::geography
              ) / 1000, 
              10
            ) as distance_km,
            COUNT(t.id) as transaction_count
          FROM users u
          INNER JOIN energy_listings l ON u.id = l.seller_id
          LEFT JOIN energy_transactions t ON u.id = t.seller_id AND t.status = 'completed'
          WHERE u.role = 'host' 
            AND l.status = 'active'
            AND u.id != $1
          GROUP BY u.id, u.full_name, u.city, u.state, l.id, l.energy_amount_kwh, l.price_per_kwh, u.longitude, u.latitude
          ORDER BY distance_km ASC
          LIMIT 10
        `, [userId, userLocation?.longitude || 77.2090, userLocation?.latitude || 28.6139]);

        matches = result.rows.map(row => ({
          id: row.listing_id,
          match_type: 'seller',
          partner_id: row.partner_id,
          partner_name: row.partner_name,
          partner_location: row.partner_location,
          overall_score: this.calculateFallbackScore(row),
          match_breakdown: {
            distance_score: Math.max(0, 100 - (row.distance_km * 2)),
            price_compatibility: 85,
            energy_needs_alignment: 80,
            timing_compatibility: 75,
            reliability_score: Math.min(100, 70 + (row.transaction_count * 5)),
          },
          potential_savings: Math.round(row.suggested_price * row.estimated_energy_kwh * 0.15 * 30),
          estimated_energy_kwh: parseFloat(row.estimated_energy_kwh),
          distance_km: parseFloat(row.distance_km),
          suggested_price: parseFloat(row.suggested_price),
          compatibility_label: this.getCompatibilityLabel(this.calculateFallbackScore(row)),
          recommendation: this.getRecommendation(row),
          matched_at: new Date().toISOString(),
        }));
      } else {
        // Find buyers (sellers looking for buyers)
        const result = await db.query(`
          SELECT 
            u.id as partner_id,
            u.full_name as partner_name,
            u.city || ', ' || u.state as partner_location,
            COALESCE(AVG(t.energy_amount_kwh), 50) as estimated_energy_kwh,
            COALESCE(AVG(t.price_per_kwh), 7.0) as suggested_price,
            COALESCE(
              ST_Distance(
                ST_MakePoint($2, $3)::geography,
                ST_MakePoint(u.longitude, u.latitude)::geography
              ) / 1000, 
              10
            ) as distance_km,
            COUNT(t.id) as transaction_count
          FROM users u
          LEFT JOIN energy_transactions t ON u.id = t.buyer_id AND t.status = 'completed'
          WHERE u.role = 'buyer'
            AND u.id != $1
          GROUP BY u.id, u.full_name, u.city, u.state, u.longitude, u.latitude
          ORDER BY distance_km ASC
          LIMIT 10
        `, [userId, userLocation?.longitude || 77.2090, userLocation?.latitude || 28.6139]);

        matches = result.rows.map(row => ({
          id: row.partner_id,
          match_type: 'buyer',
          partner_id: row.partner_id,
          partner_name: row.partner_name,
          partner_location: row.partner_location,
          overall_score: this.calculateFallbackScore(row),
          match_breakdown: {
            distance_score: Math.max(0, 100 - (row.distance_km * 2)),
            price_compatibility: 85,
            energy_needs_alignment: 80,
            timing_compatibility: 75,
            reliability_score: Math.min(100, 70 + (row.transaction_count * 5)),
          },
          potential_savings: Math.round(row.suggested_price * row.estimated_energy_kwh * 0.15 * 30),
          estimated_energy_kwh: parseFloat(row.estimated_energy_kwh),
          distance_km: parseFloat(row.distance_km),
          suggested_price: parseFloat(row.suggested_price),
          compatibility_label: this.getCompatibilityLabel(this.calculateFallbackScore(row)),
          recommendation: this.getRecommendation(row),
          matched_at: new Date().toISOString(),
        }));
      }

      return matches;
    } catch (error) {
      logger.error('Error getting fallback matches:', error);
      return [];
    }
  }

  calculateFallbackScore(row) {
    const distanceScore = Math.max(0, 100 - (row.distance_km * 2));
    const reliabilityScore = Math.min(100, 70 + (row.transaction_count * 5));
    return Math.round((distanceScore * 0.4 + reliabilityScore * 0.3 + 80 * 0.3));
  }

  getCompatibilityLabel(score) {
    if (score >= 90) return 'Excellent Match';
    if (score >= 80) return 'Great Match';
    if (score >= 70) return 'Good Match';
    return 'Fair Match';
  }

  getRecommendation(row) {
    if (row.distance_km < 5) {
      return 'Highly recommended - Close proximity and excellent energy alignment';
    } else if (row.distance_km < 10) {
      return 'Good option - Competitive pricing and reliable supply';
    } else {
      return 'Consider this option - Moderate distance but good energy alignment';
    }
  }
}

module.exports = new MarketplaceService();
