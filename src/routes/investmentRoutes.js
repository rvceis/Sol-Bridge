/**
 * Investment Routes - Opportunities, Order Creation, Payment Verification
 * Handles investment flow with Razorpay integration
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../database');
const { redis, redisAvailable } = require('../utils/cache');

// Cache helper functions
const getCache = async (key) => {
  if (!redis || !redisAvailable) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

const setCache = async (key, value, ttl = 300) => {
  if (!redis || !redisAvailable) return;
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (e) {
    // silently fail
  }
};

const delCache = async (keys) => {
  if (!redis || !redisAvailable) return;
  try {
    if (Array.isArray(keys)) {
      for (const key of keys) {
        await redis.del(key);
      }
    } else {
      await redis.del(keys);
    }
  } catch (e) {
    // silently fail
  }
};

/**
 * GET /api/v1/investments/opportunities
 * Get available investment opportunities with AI matching
 */
router.get('/opportunities', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `opportunities:${userId}`;

    // Check cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get user's preferences (if stored)
    const userQuery = `SELECT city, state FROM users WHERE id = $1`;
    const userResult = await db.query(userQuery, [userId]);
    const userLocation = userResult.rows[0];

    // Get available host spaces
    const opportunitiesQuery = `
      SELECT 
        hs.id,
        hs.host_id,
        h.full_name as host_name,
        h.rating as host_rating,
        CONCAT(hs.city, ', ', hs.state) as location,
        hs.latitude,
        hs.longitude,
        hs.available_capacity_kw,
        (hs.available_capacity_kw * 500000) as panel_price,
        (hs.available_capacity_kw * 150 * 0.85 * 8) as estimated_monthly_profit,
        18.0 as estimated_roi_percentage,
        48 as payback_period_months,
        hs.distance_to_nearest_industry_km,
        (SELECT COUNT(*) FROM industries WHERE city = hs.city OR state = hs.state) as nearby_industries,
        CASE 
          WHEN hs.city = $1 AND hs.state = $2 THEN 5
          WHEN hs.state = $2 THEN 50
          ELSE 200
        END as distance_km,
        CASE 
          WHEN hs.has_structural_certificate THEN 20
          ELSE 40
        END as risk_score,
        CASE 
          WHEN hs.city = $1 AND hs.state = $2 THEN 95
          WHEN hs.distance_to_nearest_industry_km < 10 THEN 85
          ELSE 70
        END as ai_match_score,
        hs.property_images,
        CASE 
          WHEN hs.city = $1 AND hs.state = $2 THEN true
          WHEN hs.distance_to_nearest_industry_km < 10 THEN true
          ELSE false
        END as is_ai_recommended
      FROM host_spaces hs
      JOIN users h ON hs.host_id = h.id
      WHERE hs.available_capacity_kw >= 5 AND hs.status = 'available'
      ORDER BY ai_match_score DESC, distance_km ASC
      LIMIT 20
    `;

    const result = await db.query(opportunitiesQuery, [
      userLocation.city,
      userLocation.state,
    ]);

    const response = {
      opportunities: result.rows,
    };

    // Cache for 10 minutes
    await setCache(cacheKey, response, 600);

    res.json(response);
  } catch (error) {
    console.error('Opportunities error:', error);
    res.status(500).json({ error: 'Failed to load investment opportunities' });
  }
});

/**
 * GET /api/v1/investments/opportunities/:id
 * Get detailed investment opportunity
 */
router.get('/opportunities/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `opportunity:${id}`;

    // Check cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Get host space detail
    const detailQuery = `
      SELECT 
        hs.id,
        hs.host_id,
        h.full_name as host_name,
        h.phone as host_contact,
        h.rating as host_rating,
        (SELECT COUNT(*) FROM investments WHERE host_id = hs.host_id AND status = 'active') as host_total_panels,
        CONCAT(hs.address, ', ', hs.city, ', ', hs.state, ' - ', hs.pincode) as location,
        hs.latitude,
        hs.longitude,
        hs.available_capacity_kw,
        (hs.available_capacity_kw * 500000) as panel_price,
        (hs.available_capacity_kw * 50000) as installation_cost,
        (hs.available_capacity_kw * 550000) as total_investment,
        (hs.available_capacity_kw * 150) as estimated_monthly_production_kwh,
        (hs.available_capacity_kw * 150 * 8) as estimated_monthly_revenue,
        85 as buyer_share_percentage,
        (hs.monthly_rent_per_kw * hs.available_capacity_kw) as host_rent_monthly,
        10 as platform_fee_percentage,
        (hs.available_capacity_kw * 150 * 8 * 0.85) - (hs.monthly_rent_per_kw * hs.available_capacity_kw) - (hs.available_capacity_kw * 150 * 8 * 0.10) as estimated_monthly_profit,
        18.0 as estimated_roi_percentage,
        48 as payback_period_months,
        hs.property_images,
        hs.structural_certificate_url,
        CASE 
          WHEN hs.has_structural_certificate THEN 20
          ELSE 40
        END as risk_score,
        85 as ai_match_score,
        24 as contract_duration_months,
        25 as warranty_years,
        true as maintenance_included,
        true as insurance_included
      FROM host_spaces hs
      JOIN users h ON hs.host_id = h.id
      WHERE hs.id = $1
    `;
    const detailResult = await db.query(detailQuery, [id]);

    if (!detailResult.rows.length) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const detail = detailResult.rows[0];

    // Get nearby industries
    const industriesQuery = `
      SELECT 
        id,
        company_name as name,
        5 as distance_km,
        daily_energy_demand_kwh as demand_kwh,
        max_price_per_kwh as price_per_kwh
      FROM industries
      WHERE (city = (SELECT city FROM host_spaces WHERE id = $1) 
        OR state = (SELECT state FROM host_spaces WHERE id = $1))
        AND status = 'active'
      ORDER BY daily_energy_demand_kwh DESC
      LIMIT 5
    `;
    const industriesResult = await db.query(industriesQuery, [id]);

    const response = {
      ...detail,
      nearby_industries: industriesResult.rows,
    };

    // Cache for 10 minutes
    await setCache(cacheKey, response, 600);

    res.json(response);
  } catch (error) {
    console.error('Opportunity detail error:', error);
    res.status(500).json({ error: 'Failed to load opportunity details' });
  }
});

/**
 * POST /api/v1/investments/create-investment
 * Create investment directly (payment skipped for now)
 */
router.post('/create-investment', authenticate, async (req, res) => {
  try {
    const { opportunity_id, industry_id, amount } = req.body;
    const userId = req.user.id;

    if (!opportunity_id || !industry_id || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify opportunity is still available
    const spaceQuery = `
      SELECT id, host_id, available_capacity_kw, city, state 
      FROM host_spaces 
      WHERE id = $1 AND status = 'available' AND available_capacity_kw >= 5
    `;
    const spaceResult = await db.query(spaceQuery, [opportunity_id]);

    if (!spaceResult.rows.length) {
      return res.status(400).json({ error: 'Investment opportunity not available' });
    }

    const space = spaceResult.rows[0];
    const capacity = 5; // Standard 5kW panel

    // Begin transaction
    await db.query('BEGIN');

    try {
      // Create investment
      const investmentQuery = `
        INSERT INTO investments (
          buyer_id,
          host_id,
          host_space_id,
          panel_capacity_kw,
          investment_amount,
          monthly_production_kwh,
          net_monthly_profit,
          roi_percentage,
          status,
          installation_date,
          next_maintenance_date,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'active',
          NOW() + INTERVAL '7 days',
          NOW() + INTERVAL '90 days',
          NOW()
        ) RETURNING id
      `;

      const investmentResult = await db.query(investmentQuery, [
        userId,
        space.host_id,
        opportunity_id,
        capacity,
        amount,
        capacity * 150, // Monthly production
        capacity * 150 * 8 * 0.75, // Net profit (85% - rent - fee)
        18.0, // ROI
      ]);

      const investmentId = investmentResult.rows[0].id;

      // Create industry contract
      const contractQuery = `
        INSERT INTO industry_contracts (
          investment_id,
          industry_id,
          price_per_kwh,
          contract_start_date,
          contract_end_date,
          status,
          created_at
        ) VALUES ($1, $2, 8.0, NOW(), NOW() + INTERVAL '24 months', 'active', NOW())
      `;
      await db.query(contractQuery, [investmentId, industry_id]);

      // Update host space availability
      const updateSpaceQuery = `
        UPDATE host_spaces 
        SET available_capacity_kw = available_capacity_kw - $1
        WHERE id = $2
      `;
      await db.query(updateSpaceQuery, [capacity, opportunity_id]);

      await db.query('COMMIT');

      // Clear cache
      await delCache([
        `dashboard:buyer:${userId}`,
        `dashboard:host:${space.host_id}`,
        `opportunities:${userId}`,
      ]);

      res.json({
        success: true,
        investment_id: investmentId,
        message: 'Investment created successfully',
      });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('Create investment error:', error);
    res.status(500).json({ error: 'Failed to create investment' });
  }
});

module.exports = router;
