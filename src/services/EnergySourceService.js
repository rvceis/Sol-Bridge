const db = require('../database');
const logger = require('../utils/logger');

class EnergySourceService {
  /**
   * Find and match energy sources (hosts) for a buyer
   * Uses matching algorithm based on location, price, availability
   */
  async findMatchingSources(buyerId, preferences = {}) {
    try {
      const { maxPrice = 15, maxDistance = 100, renewableOnly = false, limit = 20 } = preferences;

      // Get buyer's location
      const buyerResult = await db.query(`
        SELECT b.latitude, b.longitude, b.city, b.preferences
        FROM buyers b
        WHERE b.user_id = $1
      `, [buyerId]);

      let buyerLat = null;
      let buyerLon = null;

      if (buyerResult.rows.length > 0) {
        buyerLat = parseFloat(buyerResult.rows[0].latitude);
        buyerLon = parseFloat(buyerResult.rows[0].longitude);
      }

      // Find active hosts with listings
      const hostsQuery = `
        SELECT DISTINCT
          h.user_id as host_id,
          u.full_name as host_name,
          u.average_rating,
          u.completed_transactions,
          h.solar_capacity_kw,
          h.panel_brand,
          h.latitude,
          h.longitude,
          h.city,
          h.state,
          l.id as listing_id,
          l.energy_amount_kwh,
          l.price_per_kwh,
          l.renewable_cert,
          l.listing_type,
          CASE 
            WHEN h.latitude IS NOT NULL AND h.longitude IS NOT NULL 
              AND $2::numeric IS NOT NULL AND $3::numeric IS NOT NULL
            THEN (
              6371 * acos(
                cos(radians($2)) * cos(radians(h.latitude)) *
                cos(radians(h.longitude) - radians($3)) +
                sin(radians($2)) * sin(radians(h.latitude))
              )
            )
            ELSE NULL
          END as distance_km
        FROM hosts h
        INNER JOIN users u ON h.user_id = u.id
        INNER JOIN listings l ON l.seller_id = h.user_id
        WHERE l.status = 'active'
          AND l.energy_amount_kwh > 0
          AND l.price_per_kwh <= $4
          AND u.is_active = TRUE
          ${renewableOnly ? 'AND l.renewable_cert = TRUE' : ''}
        ORDER BY l.price_per_kwh ASC, u.average_rating DESC NULLS LAST
        LIMIT $5
      `;

      const hostsResult = await db.query(hostsQuery, [
        buyerId,
        buyerLat,
        buyerLon,
        maxPrice,
        limit
      ]);

      // Calculate match scores
      const sources = hostsResult.rows.map(host => {
        const priceScore = Math.max(0, 100 - (host.price_per_kwh / maxPrice) * 50);
        const ratingScore = (parseFloat(host.average_rating) || 3) * 20;
        const distanceScore = host.distance_km 
          ? Math.max(0, 100 - (host.distance_km / maxDistance) * 100)
          : 50;
        const renewableBonus = host.renewable_cert ? 10 : 0;
        const transactionBonus = Math.min(20, (host.completed_transactions || 0) / 5);

        const matchScore = (
          priceScore * 0.3 +
          ratingScore * 0.25 +
          distanceScore * 0.25 +
          renewableBonus +
          transactionBonus
        );

        return {
          host_id: host.host_id,
          host_name: host.host_name,
          listing_id: host.listing_id,
          solar_capacity_kw: parseFloat(host.solar_capacity_kw) || 0,
          panel_brand: host.panel_brand,
          available_kwh: parseFloat(host.energy_amount_kwh) || 0,
          price_per_kwh: parseFloat(host.price_per_kwh) || 0,
          distance_km: host.distance_km ? parseFloat(host.distance_km.toFixed(1)) : null,
          city: host.city,
          state: host.state,
          rating: parseFloat(host.average_rating) || 0,
          completed_transactions: host.completed_transactions || 0,
          renewable_certified: host.renewable_cert || false,
          listing_type: host.listing_type,
          match_score: Math.round(matchScore),
          match_breakdown: {
            price: Math.round(priceScore),
            rating: Math.round(ratingScore),
            distance: Math.round(distanceScore),
            renewable: renewableBonus * 10,
            reliability: Math.round(transactionBonus * 5)
          }
        };
      });

      // Sort by match score
      sources.sort((a, b) => b.match_score - a.match_score);

      logger.info(`[ENERGY_SOURCES] Found ${sources.length} matching sources for buyer ${buyerId}`);
      return sources;

    } catch (error) {
      logger.error('[ENERGY_SOURCES] Error finding matches:', error);
      throw error;
    }
  }

  /**
   * Save a matched host as buyer's energy source
   */
  async saveEnergySource(buyerId, hostId, data = {}) {
    try {
      const {
        sourceName,
        matchScore,
        pricePerKwh,
        distanceKm,
        renewableCertified = false,
        subscriptionType = 'on-demand',
        notes = ''
      } = data;

      // Check if already saved
      const existing = await db.query(`
        SELECT id, is_active FROM buyer_energy_sources 
        WHERE buyer_id = $1 AND host_id = $2
      `, [buyerId, hostId]);

      if (existing.rows.length > 0) {
        // Reactivate if inactive
        if (!existing.rows[0].is_active) {
          await db.query(`
            UPDATE buyer_energy_sources 
            SET is_active = TRUE, 
                source_name = COALESCE($3, source_name),
                subscription_type = $4,
                notes = $5,
                updated_at = NOW()
            WHERE id = $6
            RETURNING *
          `, [buyerId, hostId, sourceName, subscriptionType, notes, existing.rows[0].id]);
        }
        return { success: true, message: 'Energy source already saved', id: existing.rows[0].id };
      }

      // Get host info for the source name
      let finalSourceName = sourceName;
      if (!finalSourceName) {
        const hostInfo = await db.query(`
          SELECT u.full_name, h.city FROM hosts h
          JOIN users u ON h.user_id = u.id
          WHERE h.user_id = $1
        `, [hostId]);
        if (hostInfo.rows.length > 0) {
          finalSourceName = `${hostInfo.rows[0].full_name}'s Solar (${hostInfo.rows[0].city || 'Location'})`;
        }
      }

      const result = await db.query(`
        INSERT INTO buyer_energy_sources (
          buyer_id, host_id, source_name, match_score, 
          price_per_kwh, distance_km, renewable_certified,
          subscription_type, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        buyerId, hostId, finalSourceName, matchScore,
        pricePerKwh, distanceKm, renewableCertified,
        subscriptionType, notes
      ]);

      logger.info(`[ENERGY_SOURCES] Saved source ${hostId} for buyer ${buyerId}`);
      return { success: true, source: result.rows[0] };

    } catch (error) {
      logger.error('[ENERGY_SOURCES] Error saving source:', error);
      throw error;
    }
  }

  /**
   * Get buyer's saved energy sources
   */
  async getBuyerSources(buyerId, activeOnly = true) {
    try {
      const result = await db.query(`
        SELECT 
          bes.*,
          u.full_name as host_name,
          u.average_rating as host_rating,
          u.completed_transactions as host_transactions,
          h.solar_capacity_kw,
          h.panel_brand,
          h.city as host_city,
          h.state as host_state,
          l.energy_amount_kwh as available_kwh,
          l.price_per_kwh as current_price,
          l.listing_type,
          l.status as listing_status
        FROM buyer_energy_sources bes
        INNER JOIN users u ON bes.host_id = u.id
        LEFT JOIN hosts h ON h.user_id = bes.host_id
        LEFT JOIN listings l ON l.seller_id = bes.host_id AND l.status = 'active'
        WHERE bes.buyer_id = $1
        ${activeOnly ? 'AND bes.is_active = TRUE' : ''}
        ORDER BY bes.match_score DESC NULLS LAST, bes.created_at DESC
      `, [buyerId]);

      return result.rows.map(row => ({
        id: row.id,
        host_id: row.host_id,
        source_name: row.source_name,
        host_name: row.host_name,
        host_rating: parseFloat(row.host_rating) || 0,
        host_transactions: row.host_transactions || 0,
        solar_capacity_kw: parseFloat(row.solar_capacity_kw) || 0,
        panel_brand: row.panel_brand,
        city: row.host_city,
        state: row.host_state,
        match_score: parseFloat(row.match_score) || 0,
        price_per_kwh: parseFloat(row.current_price || row.price_per_kwh) || 0,
        distance_km: parseFloat(row.distance_km) || 0,
        renewable_certified: row.renewable_certified,
        available_kwh: parseFloat(row.available_kwh) || 0,
        listing_type: row.listing_type,
        listing_active: row.listing_status === 'active',
        subscription_type: row.subscription_type,
        is_active: row.is_active,
        total_energy_purchased: parseFloat(row.total_energy_purchased) || 0,
        last_purchase_at: row.last_purchase_at,
        matched_at: row.matched_at
      }));

    } catch (error) {
      logger.error('[ENERGY_SOURCES] Error getting buyer sources:', error);
      throw error;
    }
  }

  /**
   * Remove an energy source
   */
  async removeEnergySource(buyerId, sourceId) {
    try {
      const result = await db.query(`
        UPDATE buyer_energy_sources 
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1 AND buyer_id = $2
        RETURNING *
      `, [sourceId, buyerId]);

      if (result.rows.length === 0) {
        return { success: false, message: 'Energy source not found' };
      }

      logger.info(`[ENERGY_SOURCES] Removed source ${sourceId} for buyer ${buyerId}`);
      return { success: true, message: 'Energy source removed' };

    } catch (error) {
      logger.error('[ENERGY_SOURCES] Error removing source:', error);
      throw error;
    }
  }

  /**
   * Update purchase stats for a source
   */
  async recordPurchase(buyerId, hostId, energyKwh) {
    try {
      await db.query(`
        UPDATE buyer_energy_sources 
        SET total_energy_purchased = total_energy_purchased + $3,
            last_purchase_at = NOW(),
            updated_at = NOW()
        WHERE buyer_id = $1 AND host_id = $2
      `, [buyerId, hostId, energyKwh]);

      return { success: true };
    } catch (error) {
      logger.error('[ENERGY_SOURCES] Error recording purchase:', error);
      throw error;
    }
  }
}

module.exports = new EnergySourceService();
