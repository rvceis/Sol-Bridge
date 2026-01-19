/**
 * Dashboard Routes - Buyer, Host, Industry Dashboards
 * Provides summary data and detailed views for each user type
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../database');
const { redis, redisAvailable } = require('../utils/cache');

// Simple cache helper
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

// ============================================
// BUYER DASHBOARD
// ============================================

/**
 * GET /api/v1/dashboard/buyer
 * Get buyer's investment portfolio summary
 */
router.get('/buyer', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `dashboard:buyer:${userId}`;

    // Check cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Get investment summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_investments,
        SUM(panel_capacity_kw) as total_capacity_kw,
        SUM(net_monthly_profit) as monthly_profit,
        AVG(roi_percentage) as avg_roi,
        COUNT(DISTINCT host_location_city) as active_locations,
        SUM(total_earned_lifetime) as total_earned_lifetime
      FROM investments
      WHERE buyer_id = $1 AND status = 'active'
    `;
    const summaryResult = await db.query(summaryQuery, [userId]);
    const summary = summaryResult.rows[0];

    // Get detailed investments
    const investmentsQuery = `
      SELECT 
        i.id,
        i.panel_capacity_kw,
        i.investment_amount,
        i.net_monthly_profit,
        i.roi_percentage,
        i.monthly_production_kwh,
        i.status,
        i.installation_date,
        h.id as host_id,
        h.full_name as host_name,
        h.phone as host_contact,
        CONCAT(hs.city, ', ', hs.state) as host_location,
        hs.latitude,
        hs.longitude,
        ind.id as industry_id,
        ind.company_name as industry_name,
        ind.price_per_kwh as industry_price_per_kwh
      FROM investments i
      JOIN users h ON i.host_id = h.id
      JOIN host_spaces hs ON i.host_space_id = hs.id
      LEFT JOIN industry_contracts ic ON i.id = ic.investment_id
      LEFT JOIN industries ind ON ic.industry_id = ind.id
      WHERE i.buyer_id = $1
      ORDER BY i.installation_date DESC
    `;
    const investmentsResult = await db.query(investmentsQuery, [userId]);

    const response = {
      summary: {
        total_investments: parseInt(summary.total_investments) || 0,
        total_capacity_kw: parseFloat(summary.total_capacity_kw) || 0,
        monthly_profit: parseFloat(summary.monthly_profit) || 0,
        avg_roi: parseFloat(summary.avg_roi) || 0,
        active_locations: parseInt(summary.active_locations) || 0,
        total_earned_lifetime: parseFloat(summary.total_earned_lifetime) || 0,
      },
      investments: investmentsResult.rows,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    res.json(response);
  } catch (error) {
    console.error('Buyer dashboard error:', error);
    res.status(500).json({ error: 'Failed to load buyer dashboard' });
  }
});

// ============================================
// HOST DASHBOARD
// ============================================

/**
 * GET /api/v1/dashboard/host
 * Get host's panel space summary
 */
router.get('/host', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `dashboard:host:${userId}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get host space info
    const spaceQuery = `
      SELECT 
        id,
        available_capacity_kw,
        total_capacity_kw,
        monthly_rent_per_kw,
        property_rating
      FROM host_spaces
      WHERE host_id = $1
      LIMIT 1
    `;
    const spaceResult = await db.query(spaceQuery, [userId]);
    const space = spaceResult.rows[0];

    if (!space) {
      return res.json({
        summary: {
          total_panels_installed: 0,
          available_panel_slots: 0,
          total_capacity_kw: 0,
          monthly_rent_earned: 0,
          total_earned_lifetime: 0,
          next_maintenance_date: null,
          property_rating: 0,
        },
        installed_panels: [],
      });
    }

    // Get installed panels
    const panelsQuery = `
      SELECT 
        i.id,
        i.buyer_id,
        b.full_name as buyer_name,
        b.phone as buyer_contact,
        i.panel_capacity_kw as capacity_kw,
        i.installation_date,
        i.monthly_production_kwh,
        i.status,
        COALESCE(ic.industry_company_name, 'Not Assigned') as industry_name,
        i.next_maintenance_date as next_maintenance,
        (i.investment_amount * 0.05 / 12) as monthly_rent
      FROM investments i
      JOIN users b ON i.buyer_id = b.id
      LEFT JOIN (
        SELECT 
          ic.investment_id,
          ind.company_name as industry_company_name
        FROM industry_contracts ic
        JOIN industries ind ON ic.industry_id = ind.id
        WHERE ic.status = 'active'
      ) ic ON i.id = ic.investment_id
      WHERE i.host_id = $1
      ORDER BY i.installation_date DESC
    `;
    const panelsResult = await db.query(panelsQuery, [userId]);

    // Calculate summary
    const totalPanels = panelsResult.rows.length;
    const totalCapacity = panelsResult.rows.reduce(
      (sum, p) => sum + parseFloat(p.capacity_kw),
      0
    );
    const monthlyRent = panelsResult.rows.reduce(
      (sum, p) => sum + parseFloat(p.monthly_rent),
      0
    );

    // Get total earned
    const earningsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_earned
      FROM transactions
      WHERE user_id = $1 AND transaction_type = 'host_rent' AND status = 'completed'
    `;
    const earningsResult = await db.query(earningsQuery, [userId]);

    // Get next maintenance date
    const maintenanceQuery = `
      SELECT MIN(next_maintenance_date) as next_maintenance
      FROM investments
      WHERE host_id = $1 AND status = 'active'
    `;
    const maintenanceResult = await db.query(maintenanceQuery, [userId]);

    const response = {
      summary: {
        total_panels_installed: totalPanels,
        available_panel_slots: Math.floor(space.available_capacity_kw / 5), // Assuming 5kW per panel
        total_capacity_kw: totalCapacity,
        monthly_rent_earned: monthlyRent,
        total_earned_lifetime: parseFloat(earningsResult.rows[0].total_earned),
        next_maintenance_date: maintenanceResult.rows[0].next_maintenance,
        property_rating: parseFloat(space.property_rating) || 4.5,
      },
      installed_panels: panelsResult.rows,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    res.json(response);
  } catch (error) {
    console.error('Host dashboard error:', error);
    res.status(500).json({ error: 'Failed to load host dashboard' });
  }
});

// ============================================
// INDUSTRY DASHBOARD
// ============================================

/**
 * GET /api/v1/dashboard/industry
 * Get industry's energy consumption and suppliers
 */
router.get('/industry', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const period = req.query.period || 'week'; // week or month
    const cacheKey = `dashboard:industry:${userId}:${period}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get industry info
    const industryQuery = `SELECT id FROM industries WHERE user_id = $1 LIMIT 1`;
    const industryResult = await db.query(industryQuery, [userId]);

    if (!industryResult.rows.length) {
      return res.json({
        summary: {
          total_consumption_kwh: 0,
          total_cost: 0,
          grid_comparison_savings: 0,
          active_suppliers: 0,
          carbon_credits_kg: 0,
          avg_price_per_kwh: 0,
        },
        suppliers: [],
        consumption_data: { labels: [], datasets: [{ data: [] }] },
      });
    }

    const industryId = industryResult.rows[0].id;

    // Get consumption summary
    const summaryQuery = `
      SELECT 
        COALESCE(SUM(energy_consumed_kwh), 0) as total_consumption_kwh,
        COALESCE(SUM(amount_paid), 0) as total_cost,
        COALESCE(AVG(price_per_kwh), 0) as avg_price_per_kwh,
        COALESCE(SUM(carbon_offset_kg), 0) as carbon_credits_kg
      FROM industry_consumption
      WHERE industry_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `;
    const summaryResult = await db.query(summaryQuery, [industryId]);
    const summary = summaryResult.rows[0];

    // Calculate savings (assuming grid price is ₹2.5 higher)
    const gridCost =
      parseFloat(summary.total_consumption_kwh) * (parseFloat(summary.avg_price_per_kwh) + 2.5);
    const savings = gridCost - parseFloat(summary.total_cost);

    // Get active suppliers
    const suppliersQuery = `
      SELECT 
        ic.id,
        b.full_name as buyer_name,
        h.full_name as host_name,
        CONCAT(hs.city, ', ', hs.state) as host_location,
        i.panel_capacity_kw,
        i.monthly_production_kwh as monthly_supply_kwh,
        ic.price_per_kwh as contract_price_per_kwh,
        ic.contract_start_date,
        ic.contract_end_date,
        ic.status,
        CASE 
          WHEN ic.contract_end_date <= NOW() + INTERVAL '30 days' THEN 'expiring'
          WHEN ic.status = 'active' THEN 'active'
          ELSE 'inactive'
        END as status
      FROM industry_contracts ic
      JOIN investments i ON ic.investment_id = i.id
      JOIN users b ON i.buyer_id = b.id
      JOIN users h ON i.host_id = h.id
      JOIN host_spaces hs ON i.host_space_id = hs.id
      WHERE ic.industry_id = $1
      ORDER BY ic.contract_start_date DESC
    `;
    const suppliersResult = await db.query(suppliersQuery, [industryId]);

    // Get consumption data for chart
    const daysBack = period === 'week' ? 7 : 30;
    const consumptionQuery = `
      SELECT 
        DATE(created_at) as date,
        SUM(energy_consumed_kwh) as kwh
      FROM industry_consumption
      WHERE industry_id = $1 AND created_at >= NOW() - INTERVAL '${daysBack} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    const consumptionResult = await db.query(consumptionQuery, [industryId]);

    const labels = consumptionResult.rows.map((row) =>
      new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );
    const data = consumptionResult.rows.map((row) => parseFloat(row.kwh));

    const response = {
      summary: {
        total_consumption_kwh: parseFloat(summary.total_consumption_kwh) || 0,
        total_cost: parseFloat(summary.total_cost) || 0,
        grid_comparison_savings: savings || 0,
        active_suppliers: suppliersResult.rows.filter((s) => s.status === 'active').length,
        carbon_credits_kg: parseFloat(summary.carbon_credits_kg) || 0,
        avg_price_per_kwh: parseFloat(summary.avg_price_per_kwh) || 0,
      },
      suppliers: suppliersResult.rows,
      consumption_data: {
        labels,
        datasets: [{ data }],
      },
    };

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    res.json(response);
  } catch (error) {
    console.error('Industry dashboard error:', error);
    res.status(500).json({ error: 'Failed to load industry dashboard' });
  }
});

module.exports = router;
