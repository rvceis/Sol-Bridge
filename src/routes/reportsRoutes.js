/**
 * Reports Routes - PDF Certificates & CSV Exports
 * Download energy certificates, carbon reports, transaction exports
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const certificateService = require('../services/certificateService');
const exportService = require('../services/exportService');
const db = require('../config/database');

/**
 * GET /api/v1/reports/energy-certificate
 * Generate energy certificate for industry
 */
router.get('/energy-certificate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period } = req.query; // 'month' or 'year'

    // Get industry info
    const industryQuery = `SELECT * FROM industries WHERE user_id = $1`;
    const industryResult = await db.query(industryQuery, [userId]);

    if (!industryResult.rows.length) {
      return res.status(404).json({ error: 'Industry not registered' });
    }

    const industry = industryResult.rows[0];

    // Get consumption data
    const consumptionQuery = `
      SELECT 
        SUM(energy_consumed_kwh) as total_kwh,
        SUM(carbon_offset_kg) as carbon_offset_kg
      FROM industry_consumption
      WHERE industry_id = $1
        AND consumption_date >= NOW() - INTERVAL '${period === 'year' ? '1 year' : '30 days'}'
    `;
    const consumptionResult = await db.query(consumptionQuery, [industry.id]);

    const consumptionData = {
      total_kwh: parseFloat(consumptionResult.rows[0].total_kwh) || 0,
      carbon_offset_kg: parseFloat(consumptionResult.rows[0].carbon_offset_kg) || 0,
      period: period === 'year' ? 'Last 12 Months' : 'Last 30 Days',
    };

    const { filename, filepath } = await certificateService.generateEnergyCertificate(
      industry,
      consumptionData
    );

    res.download(filepath, filename);
  } catch (error) {
    console.error('Energy certificate error:', error);
    res.status(500).json({ error: 'Failed to generate energy certificate' });
  }
});

/**
 * GET /api/v1/reports/carbon-offset-report
 * Generate carbon offset report
 */
router.get('/carbon-offset-report', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = {
      id: userId,
      full_name: req.user.full_name,
    };

    // Get carbon data from investments
    const carbonQuery = `
      SELECT SUM(i.monthly_production_kwh * 0.7 * 12) as total_kg
      FROM investments i
      WHERE i.buyer_id = $1 AND i.status = 'active'
    `;
    const carbonResult = await db.query(carbonQuery, [userId]);

    const carbonData = {
      total_kg: parseFloat(carbonResult.rows[0].total_kg) || 0,
    };

    const { filename, filepath } = await certificateService.generateCarbonOffsetReport(
      user,
      carbonData
    );

    res.download(filepath, filename);
  } catch (error) {
    console.error('Carbon report error:', error);
    res.status(500).json({ error: 'Failed to generate carbon offset report' });
  }
});

/**
 * GET /api/v1/reports/investment-certificate/:investmentId
 * Generate investment certificate
 */
router.get('/investment-certificate/:investmentId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { investmentId } = req.params;

    // Get investment details
    const query = `
      SELECT 
        i.*,
        b.full_name as buyer_name,
        CONCAT(hs.city, ', ', hs.state) as host_location
      FROM investments i
      JOIN users b ON i.buyer_id = b.id
      JOIN host_spaces hs ON i.host_space_id = hs.id
      WHERE i.id = $1 AND i.buyer_id = $2
    `;
    const result = await db.query(query, [investmentId, userId]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Investment not found' });
    }

    const investment = result.rows[0];

    const { filename, filepath } = await certificateService.generateInvestmentCertificate(
      investment
    );

    res.download(filepath, filename);
  } catch (error) {
    console.error('Investment certificate error:', error);
    res.status(500).json({ error: 'Failed to generate investment certificate' });
  }
});

/**
 * GET /api/v1/reports/export/transactions
 * Export transaction history as CSV
 */
router.get('/export/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await exportService.exportTransactionHistory(userId, start, end);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.download(result.filepath, result.filename);
  } catch (error) {
    console.error('Transaction export error:', error);
    res.status(500).json({ error: 'Failed to export transactions' });
  }
});

/**
 * GET /api/v1/reports/export/production
 * Export production data as CSV
 */
router.get('/export/production', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await exportService.exportProductionData(userId, start, end);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.download(result.filepath, result.filename);
  } catch (error) {
    console.error('Production export error:', error);
    res.status(500).json({ error: 'Failed to export production data' });
  }
});

/**
 * GET /api/v1/reports/export/billing
 * Export billing data as CSV (for industries)
 */
router.get('/export/billing', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    // Get industry ID
    const industryQuery = `SELECT id FROM industries WHERE user_id = $1`;
    const industryResult = await db.query(industryQuery, [userId]);

    if (!industryResult.rows.length) {
      return res.status(404).json({ error: 'Industry not registered' });
    }

    const industryId = industryResult.rows[0].id;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await exportService.exportBillingData(industryId, start, end);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.download(result.filepath, result.filename);
  } catch (error) {
    console.error('Billing export error:', error);
    res.status(500).json({ error: 'Failed to export billing data' });
  }
});

/**
 * GET /api/v1/reports/export/investments-summary
 * Export investment summary as CSV
 */
router.get('/export/investments-summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await exportService.exportInvestmentSummary(userId);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.download(result.filepath, result.filename);
  } catch (error) {
    console.error('Investment summary export error:', error);
    res.status(500).json({ error: 'Failed to export investment summary' });
  }
});

/**
 * GET /api/v1/reports/export/host-earnings
 * Export host earnings as CSV
 */
router.get('/export/host-earnings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const result = await exportService.exportHostEarnings(userId, start, end);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.download(result.filepath, result.filename);
  } catch (error) {
    console.error('Host earnings export error:', error);
    res.status(500).json({ error: 'Failed to export host earnings' });
  }
});

module.exports = router;
