/**
 * Registration Routes - Host Space & Industry Registration
 * Handle property and industry registrations
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../config/database');
const redis = require('../config/redis');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath =
      file.fieldname === 'property_images'
        ? './uploads/properties/'
        : './uploads/certificates/';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'property_images') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files allowed for property images'));
      }
    } else if (file.fieldname === 'structural_certificate') {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files allowed for certificates'));
      }
    } else {
      cb(null, true);
    }
  },
});

/**
 * POST /api/v1/host/register-space
 * Register host space for panel installations
 */
router.post(
  '/register-space',
  authenticateToken,
  upload.fields([
    { name: 'property_images', maxCount: 5 },
    { name: 'structural_certificate', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        property_type,
        available_area_sqft,
        estimated_capacity_kw,
        address,
        city,
        state,
        pincode,
        latitude,
        longitude,
        monthly_rent_per_kw,
        has_structural_certificate,
        is_near_industry,
        distance_to_nearest_industry_km,
      } = req.body;

      // Validation
      if (
        !property_type ||
        !available_area_sqft ||
        !estimated_capacity_kw ||
        !address ||
        !city ||
        !state ||
        !pincode ||
        !monthly_rent_per_kw
      ) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if host already has registered space
      const existingQuery = `SELECT id FROM host_spaces WHERE host_id = $1`;
      const existingResult = await db.query(existingQuery, [userId]);

      if (existingResult.rows.length > 0) {
        return res
          .status(400)
          .json({ error: 'You already have a registered space. Use update endpoint instead.' });
      }

      // Process uploaded files
      const propertyImages = req.files['property_images']
        ? req.files['property_images'].map((file) => `/uploads/properties/${file.filename}`)
        : [];

      const certificateUrl = req.files['structural_certificate']
        ? `/uploads/certificates/${req.files['structural_certificate'][0].filename}`
        : null;

      // Insert host space
      const insertQuery = `
        INSERT INTO host_spaces (
          host_id,
          property_type,
          available_area_sqft,
          total_capacity_kw,
          available_capacity_kw,
          address,
          city,
          state,
          pincode,
          latitude,
          longitude,
          monthly_rent_per_kw,
          has_structural_certificate,
          structural_certificate_url,
          is_near_industry,
          distance_to_nearest_industry_km,
          property_images,
          status,
          property_rating,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'available', 4.5, NOW()
        ) RETURNING id
      `;

      const result = await db.query(insertQuery, [
        userId,
        property_type,
        parseFloat(available_area_sqft),
        parseFloat(estimated_capacity_kw),
        address,
        city,
        state,
        pincode,
        latitude || null,
        longitude || null,
        parseFloat(monthly_rent_per_kw),
        has_structural_certificate === 'true',
        certificateUrl,
        is_near_industry === 'true',
        distance_to_nearest_industry_km ? parseFloat(distance_to_nearest_industry_km) : null,
        JSON.stringify(propertyImages),
      ]);

      // Clear cache
      await redis.del(`opportunities:*`);

      res.json({
        success: true,
        space_id: result.rows[0].id,
        message: 'Host space registered successfully',
      });
    } catch (error) {
      console.error('Host registration error:', error);
      res.status(500).json({ error: 'Failed to register host space' });
    }
  }
);

/**
 * POST /api/v1/host/update-capacity
 * Update host space capacity
 */
router.post('/update-capacity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { additional_capacity_kw } = req.body;

    if (!additional_capacity_kw || parseFloat(additional_capacity_kw) <= 0) {
      return res.status(400).json({ error: 'Invalid capacity value' });
    }

    const updateQuery = `
      UPDATE host_spaces 
      SET 
        total_capacity_kw = total_capacity_kw + $1,
        available_capacity_kw = available_capacity_kw + $1,
        updated_at = NOW()
      WHERE host_id = $2
      RETURNING id, total_capacity_kw, available_capacity_kw
    `;

    const result = await db.query(updateQuery, [parseFloat(additional_capacity_kw), userId]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Host space not found' });
    }

    // Clear cache
    await redis.del(`dashboard:host:${userId}`);
    await redis.del(`opportunities:*`);

    res.json({
      success: true,
      space: result.rows[0],
      message: 'Capacity updated successfully',
    });
  } catch (error) {
    console.error('Capacity update error:', error);
    res.status(500).json({ error: 'Failed to update capacity' });
  }
});

/**
 * POST /api/v1/industry/register
 * Register industry for energy procurement
 */
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_name,
      industry_type,
      daily_energy_demand_kwh,
      monthly_budget,
      max_price_per_kwh,
      operational_hours_per_day,
      peak_demand_hours,
      address,
      city,
      state,
      pincode,
      contact_person,
      contact_phone,
      contact_email,
      has_grid_backup,
      requires_24x7_supply,
      willing_to_sign_long_term_contract,
      contract_duration_preference_months,
    } = req.body;

    // Validation
    if (
      !company_name ||
      !industry_type ||
      !daily_energy_demand_kwh ||
      !max_price_per_kwh ||
      !address ||
      !city ||
      !state ||
      !pincode ||
      !contact_person ||
      !contact_phone ||
      !contact_email
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if industry already registered
    const existingQuery = `SELECT id FROM industries WHERE user_id = $1`;
    const existingResult = await db.query(existingQuery, [userId]);

    if (existingResult.rows.length > 0) {
      return res
        .status(400)
        .json({ error: 'Industry already registered. Use update endpoint instead.' });
    }

    // Insert industry
    const insertQuery = `
      INSERT INTO industries (
        user_id,
        company_name,
        industry_type,
        daily_energy_demand_kwh,
        monthly_budget,
        max_price_per_kwh,
        operational_hours_per_day,
        peak_demand_hours,
        address,
        city,
        state,
        pincode,
        contact_person,
        contact_phone,
        contact_email,
        has_grid_backup,
        requires_24x7_supply,
        willing_to_sign_long_term_contract,
        contract_duration_preference_months,
        status,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'active', NOW()
      ) RETURNING id
    `;

    const result = await db.query(insertQuery, [
      userId,
      company_name,
      industry_type,
      parseFloat(daily_energy_demand_kwh),
      monthly_budget ? parseFloat(monthly_budget) : null,
      parseFloat(max_price_per_kwh),
      operational_hours_per_day ? parseInt(operational_hours_per_day) : 24,
      peak_demand_hours || 'all-day',
      address,
      city,
      state,
      pincode,
      contact_person,
      contact_phone,
      contact_email,
      has_grid_backup === true || has_grid_backup === 'true',
      requires_24x7_supply === true || requires_24x7_supply === 'true',
      willing_to_sign_long_term_contract === true ||
        willing_to_sign_long_term_contract === 'true',
      contract_duration_preference_months ? parseInt(contract_duration_preference_months) : 12,
    ]);

    res.json({
      success: true,
      industry_id: result.rows[0].id,
      message: 'Industry registered successfully',
    });
  } catch (error) {
    console.error('Industry registration error:', error);
    res.status(500).json({ error: 'Failed to register industry' });
  }
});

/**
 * GET /api/v1/industry/suppliers
 * Find available solar suppliers for industry
 */
router.get('/suppliers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get industry info
    const industryQuery = `SELECT city, state, daily_energy_demand_kwh, max_price_per_kwh FROM industries WHERE user_id = $1`;
    const industryResult = await db.query(industryQuery, [userId]);

    if (!industryResult.rows.length) {
      return res.status(404).json({ error: 'Industry not registered' });
    }

    const industry = industryResult.rows[0];

    // Find available investments near industry
    const suppliersQuery = `
      SELECT 
        i.id as investment_id,
        i.panel_capacity_kw,
        i.monthly_production_kwh,
        b.full_name as buyer_name,
        h.full_name as host_name,
        CONCAT(hs.city, ', ', hs.state) as location,
        hs.latitude,
        hs.longitude,
        CASE 
          WHEN hs.city = $1 THEN 5
          WHEN hs.state = $2 THEN 30
          ELSE 100
        END as distance_km,
        $3 as suggested_price_per_kwh,
        i.installation_date
      FROM investments i
      JOIN users b ON i.buyer_id = b.id
      JOIN users h ON i.host_id = h.id
      JOIN host_spaces hs ON i.host_space_id = hs.id
      WHERE i.status = 'active'
        AND i.id NOT IN (SELECT investment_id FROM industry_contracts WHERE status = 'active')
        AND i.monthly_production_kwh >= $4 * 0.1
      ORDER BY distance_km ASC, i.panel_capacity_kw DESC
      LIMIT 10
    `;

    const suppliersResult = await db.query(suppliersQuery, [
      industry.city,
      industry.state,
      parseFloat(industry.max_price_per_kwh),
      parseFloat(industry.daily_energy_demand_kwh),
    ]);

    res.json({
      suppliers: suppliersResult.rows,
    });
  } catch (error) {
    console.error('Find suppliers error:', error);
    res.status(500).json({ error: 'Failed to find suppliers' });
  }
});

module.exports = router;
