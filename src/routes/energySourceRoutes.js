const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const energySourceService = require('../services/EnergySourceService');
const logger = require('../utils/logger');

/**
 * ENERGY SOURCES ROUTES
 * For buyers to discover and manage their energy sources (matched hosts)
 */

/**
 * GET /api/v1/energy-sources/find
 * Find matching energy sources for buyer based on preferences
 */
router.get('/find', authenticate, async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { maxPrice, maxDistance, renewableOnly, limit } = req.query;

    const preferences = {
      maxPrice: maxPrice ? parseFloat(maxPrice) : 15,
      maxDistance: maxDistance ? parseFloat(maxDistance) : 100,
      renewableOnly: renewableOnly === 'true',
      limit: limit ? parseInt(limit) : 20
    };

    const sources = await energySourceService.findMatchingSources(buyerId, preferences);

    res.json({
      success: true,
      count: sources.length,
      data: sources
    });
  } catch (error) {
    logger.error('[ENERGY_SOURCES_API] Find error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find energy sources',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/energy-sources/save
 * Save a host as buyer's energy source
 */
router.post('/save', authenticate, async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { 
      hostId, 
      sourceName, 
      matchScore, 
      pricePerKwh, 
      distanceKm,
      renewableCertified,
      subscriptionType,
      notes 
    } = req.body;

    if (!hostId) {
      return res.status(400).json({
        success: false,
        message: 'hostId is required'
      });
    }

    const result = await energySourceService.saveEnergySource(buyerId, hostId, {
      sourceName,
      matchScore,
      pricePerKwh,
      distanceKm,
      renewableCertified,
      subscriptionType,
      notes
    });

    res.json(result);
  } catch (error) {
    logger.error('[ENERGY_SOURCES_API] Save error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save energy source',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/energy-sources/my-sources
 * Get buyer's saved energy sources
 */
router.get('/my-sources', authenticate, async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { activeOnly } = req.query;

    const sources = await energySourceService.getBuyerSources(
      buyerId, 
      activeOnly !== 'false'
    );

    res.json({
      success: true,
      count: sources.length,
      data: sources
    });
  } catch (error) {
    logger.error('[ENERGY_SOURCES_API] Get sources error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get energy sources',
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/energy-sources/:sourceId
 * Remove an energy source
 */
router.delete('/:sourceId', authenticate, async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { sourceId } = req.params;

    const result = await energySourceService.removeEnergySource(buyerId, sourceId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('[ENERGY_SOURCES_API] Remove error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove energy source',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/energy-sources/:sourceId/purchase
 * Record a purchase from an energy source (updates stats)
 */
router.post('/:sourceId/purchase', authenticate, async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { hostId, energyKwh } = req.body;

    if (!hostId || !energyKwh) {
      return res.status(400).json({
        success: false,
        message: 'hostId and energyKwh are required'
      });
    }

    const result = await energySourceService.recordPurchase(buyerId, hostId, energyKwh);

    res.json(result);
  } catch (error) {
    logger.error('[ENERGY_SOURCES_API] Purchase record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record purchase',
      error: error.message
    });
  }
});

module.exports = router;
