/**
 * Report Routes - Download transaction reports and analytics
 */

const express = require('express');
const router = express.Router();
const ReportService = require('../services/ReportService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/v1/reports/transaction/:transactionId
 * Generate and download transaction report
 */
router.get('/transaction/:transactionId', authenticate, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { format = 'json' } = req.query;

    const report = await ReportService.generateTransactionReport(transactionId);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${report.files.csv}"`);
      const csvContent = await require('fs').promises.readFile(report.paths.csv, 'utf8');
      return res.send(csvContent);
    }

    res.json({
      success: true,
      message: 'Transaction report generated',
      data: report,
    });
  } catch (error) {
    logger.error('Error generating transaction report:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate report',
    });
  }
});

/**
 * GET /api/v1/reports/analytics
 * Get user analytics report
 */
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { start_date, end_date } = req.query;

    const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end_date ? new Date(end_date) : new Date();

    const analytics = await ReportService.generateUserAnalytics(userId, startDate, endDate);

    res.json({
      success: true,
      message: 'Analytics report generated',
      data: analytics.data,
    });
  } catch (error) {
    logger.error('Error generating analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate analytics',
    });
  }
});

/**
 * GET /api/v1/reports/list
 * List all reports for current user
 */
router.get('/list', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await ReportService.listUserReports(userId);

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    logger.error('Error listing reports:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list reports',
    });
  }
});

/**
 * GET /api/v1/reports/download/:filename
 * Download a specific report file
 */
router.get('/download/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.user.id;

    // Verify file belongs to user
    if (!filename.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const report = await ReportService.getReport(filename);

    if (filename.endsWith('.csv')) {
      res.setHeader('Content-Type', 'text/csv');
    } else if (filename.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(report.content);
  } catch (error) {
    logger.error('Error downloading report:', error);
    res.status(404).json({
      success: false,
      error: 'Report not found',
    });
  }
});

module.exports = router;
