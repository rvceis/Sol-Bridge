const db = require('../database');
const logger = require('../utils/logger');

class LocationService {
  // Get nearby users (sellers, investors, hosters) within a radius
  async getNearbyUsers(latitude, longitude, radiusKm = 50, userTypes = ['seller'], limit = 50, sortBy = 'distance') {
    try {
      // Convert radius to degrees (approximate: 1 degree ≈ 111 km)
      const radiusDegrees = radiusKm / 111;

      // Build ORDER BY clause
      let orderClause = 'distance_km ASC';
      if (sortBy === 'rating') {
        orderClause = 'average_rating DESC, distance_km ASC';
      }

      const result = await db.query(`
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.role,
          u.kyc_status,
          u.created_at,
          ua.city,
          ua.state,
          ua.address_type,
          (
            SELECT COUNT(*) FROM energy_listings l 
            WHERE l.seller_id = u.id AND l.status = 'active'
          ) as active_listings,
          (
            SELECT COALESCE(SUM(l.energy_amount_kwh), 0) 
            FROM energy_listings l 
            WHERE l.seller_id = u.id AND l.status = 'active'
          ) as available_energy_kwh,
          (
            SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id
          ) as device_count,
          (
            SELECT COALESCE(AVG(t.rating), 0) 
            FROM energy_transactions t 
            WHERE t.seller_id = u.id AND t.rating IS NOT NULL
          ) as average_rating,
          (
            SELECT COUNT(*) 
            FROM energy_transactions t 
            WHERE t.seller_id = u.id AND t.status = 'completed'
          ) as completed_transactions,
          COALESCE(
            SQRT(
              POWER(ua.latitude - $1, 2) + 
              POWER(ua.longitude - $2, 2)
            ) * 111,
            0
          ) as distance_km
        FROM users u
        JOIN user_addresses ua ON u.id = ua.user_id
        WHERE ua.is_default = true
          AND u.role = ANY($3)
          AND ua.latitude IS NOT NULL
          AND ua.longitude IS NOT NULL
          AND ua.latitude BETWEEN $1 - $4 AND $1 + $4
          AND ua.longitude BETWEEN $2 - $4 AND $2 + $4
        ORDER BY ${orderClause}
        LIMIT $5
      `, [latitude, longitude, userTypes, radiusDegrees, limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting nearby users:', error);
      throw error;
    }
  }

  // Get nearby listings with distance
  async getNearbyListings(latitude, longitude, radiusKm = 50, filters = {}, sortBy = 'distance') {
    try {
      const radiusDegrees = radiusKm / 111;
      const {
        min_price,
        max_price,
        min_energy,
        max_energy,
        renewable_only,
        listing_type,
        limit = 50
      } = filters;

      let query = `
        SELECT 
          l.*,
          u.full_name as seller_name,
          u.kyc_status as seller_kyc_status,
          ua.city as seller_city,
          ua.state as seller_state,
          (
            SELECT COALESCE(AVG(rating), 0) FROM energy_transactions 
            WHERE seller_id = u.id AND rating IS NOT NULL
          ) as average_rating,
          d.device_type,
          d.device_model,
          SQRT(
            POWER(COALESCE(l.location_latitude, ua.latitude) - $1, 2) + 
            POWER(COALESCE(l.location_longitude, ua.longitude) - $2, 2)
          ) * 111 as distance_km
        FROM energy_listings l
        JOIN users u ON l.seller_id = u.id
        LEFT JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_default = true
        LEFT JOIN devices d ON l.device_id = d.device_id
        WHERE l.status = 'active'
          AND l.available_to > NOW()
          AND (
            (l.location_latitude IS NOT NULL AND 
             l.location_latitude BETWEEN $1 - $3 AND $1 + $3 AND
             l.location_longitude BETWEEN $2 - $3 AND $2 + $3)
            OR
            (l.location_latitude IS NULL AND
             ua.latitude BETWEEN $1 - $3 AND $1 + $3 AND
             ua.longitude BETWEEN $2 - $3 AND $2 + $3)
          )
      `;

      const params = [latitude, longitude, radiusDegrees];
      let paramCount = 4;

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

      if (renewable_only) {
        query += ` AND l.renewable_cert = TRUE`;
      }

      if (listing_type) {
        query += ` AND l.listing_type = $${paramCount}`;
        params.push(listing_type);
        paramCount++;
      }

      // Dynamic sorting
      let orderClause = 'distance_km ASC';
      if (sortBy === 'price') {
        orderClause = 'l.price_per_kwh ASC, distance_km ASC';
      } else if (sortBy === 'rating') {
        orderClause = 'average_rating DESC, distance_km ASC';
      }

      query += ` ORDER BY ${orderClause} LIMIT $${paramCount}`;
      params.push(limit);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting nearby listings:', error);
      throw error;
    }
  }

  // Get heat map data for energy production/consumption
  async getEnergyHeatmap(latitude, longitude, radiusKm = 100) {
    try {
      const radiusDegrees = radiusKm / 111;

      const result = await db.query(`
        SELECT 
          ROUND(CAST(ua.latitude AS numeric), 2) as lat_bucket,
          ROUND(CAST(ua.longitude AS numeric), 2) as lng_bucket,
          COUNT(DISTINCT u.id) as user_count,
          COUNT(DISTINCT d.device_id) as device_count,
          COALESCE(SUM(l.energy_amount_kwh), 0) as total_energy_available,
          COUNT(DISTINCT l.id) as listing_count
        FROM users u
        JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_default = true
        LEFT JOIN devices d ON u.id = d.user_id
        LEFT JOIN energy_listings l ON u.id = l.seller_id AND l.status = 'active'
        WHERE ua.latitude BETWEEN $1 - $3 AND $1 + $3
          AND ua.longitude BETWEEN $2 - $3 AND $2 + $3
        GROUP BY lat_bucket, lng_bucket
        HAVING COUNT(DISTINCT u.id) > 0
        ORDER BY total_energy_available DESC
      `, [latitude, longitude, radiusDegrees]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting energy heatmap:', error);
      throw error;
    }
  }

  // Update user location
  async updateUserLocation(userId, latitude, longitude) {
    try {
      const result = await db.query(`
        UPDATE user_addresses
        SET latitude = $2, longitude = $3, updated_at = NOW()
        WHERE user_id = $1 AND is_default = true
        RETURNING *
      `, [userId, latitude, longitude]);

      if (result.rows.length === 0) {
        // Create primary address with just coordinates
        const insertResult = await db.query(`
          INSERT INTO user_addresses (user_id, latitude, longitude, is_default, address_type, address_line1, city, state, postal_code)
          VALUES ($1, $2, $3, true, 'home', 'Location set via app', 'Unknown', 'Unknown', '000000')
          RETURNING *
        `, [userId, latitude, longitude]);
        return insertResult.rows[0];
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user location:', error);
      throw error;
    }
  }
}

module.exports = new LocationService();
