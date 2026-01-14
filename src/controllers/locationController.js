const LocationService = require('../services/LocationService');
const OptimizationService = require('../services/OptimizationService');
const logger = require('../utils/logger');

class LocationController {
  // Get nearby users (sellers, investors, hosters)
  async getNearbyUsers(req, res) {
    try {
      const { latitude, longitude, radius, types } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const userTypes = types ? types.split(',') : ['seller', 'investor', 'hoster'];
      const radiusKm = parseInt(radius) || 50;

      const users = await LocationService.getNearbyUsers(
        parseFloat(latitude),
        parseFloat(longitude),
        radiusKm,
        userTypes
      );

      res.json({
        success: true,
        data: users,
        count: users.length,
        query: { latitude, longitude, radius: radiusKm, types: userTypes }
      });
    } catch (error) {
      logger.error('Error in getNearbyUsers:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get nearby users'
      });
    }
  }

  // Get nearby listings
  async getNearbyListings(req, res) {
    try {
      const { latitude, longitude, radius, min_price, max_price, min_energy, max_energy, renewable_only, listing_type, limit } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const filters = {
        min_price: min_price ? parseFloat(min_price) : undefined,
        max_price: max_price ? parseFloat(max_price) : undefined,
        min_energy: min_energy ? parseFloat(min_energy) : undefined,
        max_energy: max_energy ? parseFloat(max_energy) : undefined,
        renewable_only: renewable_only === 'true',
        listing_type,
        limit: parseInt(limit) || 50
      };

      const listings = await LocationService.getNearbyListings(
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(radius) || 50,
        filters
      );

      res.json({
        success: true,
        data: listings,
        count: listings.length
      });
    } catch (error) {
      logger.error('Error in getNearbyListings:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get nearby listings'
      });
    }
  }

  // Get energy heatmap
  async getEnergyHeatmap(req, res) {
    try {
      const { latitude, longitude, radius } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const heatmap = await LocationService.getEnergyHeatmap(
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(radius) || 100
      );

      res.json({
        success: true,
        data: heatmap,
        count: heatmap.length
      });
    } catch (error) {
      logger.error('Error in getEnergyHeatmap:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get energy heatmap'
      });
    }
  }

  // Update user location
  async updateLocation(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const result = await LocationService.updateUserLocation(
        userId,
        parseFloat(latitude),
        parseFloat(longitude)
      );

      res.json({
        success: true,
        message: 'Location updated successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in updateLocation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update location'
      });
    }
  }

  // Get optimal energy allocation
  async getOptimalAllocation(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { energy_needed, latitude, longitude, max_distance, max_price, prefer_renewable, min_rating } = req.body;

      if (!energy_needed || !latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Energy needed, latitude, and longitude are required'
        });
      }

      const preferences = {
        maxDistance: max_distance ? parseInt(max_distance) : 100,
        maxPrice: max_price ? parseFloat(max_price) : null,
        preferRenewable: prefer_renewable !== false,
        minSellerRating: min_rating ? parseFloat(min_rating) : 0
      };

      const allocation = await OptimizationService.findOptimalAllocation(
        userId,
        parseFloat(energy_needed),
        parseFloat(latitude),
        parseFloat(longitude),
        preferences
      );

      res.json({
        success: true,
        data: allocation
      });
    } catch (error) {
      logger.error('Error in getOptimalAllocation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get optimal allocation'
      });
    }
  }

  // Get pricing recommendation
  async getPricingRecommendation(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { energy_amount, latitude, longitude } = req.query;

      if (!energy_amount || !latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Energy amount, latitude, and longitude are required'
        });
      }

      const recommendation = await OptimizationService.getPricingRecommendation(
        userId,
        parseFloat(energy_amount),
        parseFloat(latitude),
        parseFloat(longitude)
      );

      res.json({
        success: true,
        data: recommendation
      });
    } catch (error) {
      logger.error('Error in getPricingRecommendation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get pricing recommendation'
      });
    }
  }

  // Get investment opportunities
  async getInvestmentOpportunities(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      const { latitude, longitude, budget } = req.query;

      if (!latitude || !longitude || !budget) {
        return res.status(400).json({
          success: false,
          error: 'Latitude, longitude, and budget are required'
        });
      }

      const opportunities = await OptimizationService.scoreInvestmentOpportunities(
        userId,
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(budget)
      );

      res.json({
        success: true,
        data: opportunities
      });
    } catch (error) {
      logger.error('Error in getInvestmentOpportunities:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get investment opportunities'
      });
    }
  }

  // Get demand prediction
  async getDemandPrediction(req, res) {
    try {
      const { latitude, longitude, days } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const prediction = await OptimizationService.predictDemand(
        parseFloat(latitude),
        parseFloat(longitude),
        parseInt(days) || 7
      );

      res.json({
        success: true,
        data: prediction
      });
    } catch (error) {
      logger.error('Error in getDemandPrediction:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get demand prediction'
      });
    }
  }
}

module.exports = new LocationController();
