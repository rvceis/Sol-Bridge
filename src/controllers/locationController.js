const LocationService = require('../services/LocationService');
const OptimizationService = require('../services/OptimizationService');
const logger = require('../utils/logger');
const { cacheGet, cacheSet } = require('../utils/cache');

class LocationController {
  // Get nearby users (sellers, investors, hosters) within a radius (with Redis caching)
  async getNearbyUsers(req, res) {
    try {
      const { latitude, longitude, radius, types, sort, limit } = req.query;

      // Validate location
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({
          success: false,
          error: 'Invalid latitude/longitude. Lat: [-90, 90], Lng: [-180, 180]'
        });
      }

      // Validate and enforce limits
      let radiusKm = parseInt(radius) || 50;
      const MAX_RADIUS = 200;
      const MAX_LIMIT = 100;
      
      if (radiusKm > MAX_RADIUS) {
        radiusKm = MAX_RADIUS;
      }
      if (radiusKm < 1) {
        radiusKm = 1;
      }

      let limitValue = parseInt(limit) || 50;
      if (limitValue > MAX_LIMIT) {
        limitValue = MAX_LIMIT;
      }

      const userTypes = types ? types.split(',').filter(t => ['seller', 'investor', 'hoster'].includes(t)) : ['seller'];
      const sortBy = sort && ['distance', 'rating'].includes(sort) ? sort : 'distance';

      // Create cache key (rounded coordinates for cache hits)
      const roundedLat = Math.round(lat * 100) / 100;
      const roundedLng = Math.round(lng * 100) / 100;
      const cacheKey = `location:nearby:${roundedLat},${roundedLng}:${radiusKm}:${userTypes.join(',')}:${sortBy}`;
      
      // Try cache (2 minute TTL for location data)
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.debug('Returning nearby users from cache');
        return res.json({
          success: true,
          data: cached.users,
          count: cached.users.length,
          metadata: cached.metadata,
          cached: true
        });
      }

      const users = await LocationService.getNearbyUsers(
        lat,
        lng,
        radiusKm,
        userTypes,
        limitValue,
        sortBy
      );

      // Privacy: hide exact coordinates, expose only city/distance
      const privacyShapedUsers = users.map(user => ({
        id: user.id,
        name: user.full_name,
        role: user.role,
        kyc_status: user.kyc_status,
        city: user.city,
        state: user.state,
        distance_km: Math.round(user.distance_km * 10) / 10,
        active_listings: user.active_listings,
        available_energy_kwh: Math.round(user.available_energy_kwh * 100) / 100,
        device_count: user.device_count,
        average_rating: Math.round(user.average_rating * 10) / 10,
        completed_transactions: user.completed_transactions,
        joined_date: user.created_at
      }));
      
      const metadata = {
        search_radius_km: radiusKm,
        max_radius_km: MAX_RADIUS,
        sorted_by: sortBy,
        user_types: userTypes
      };
      
      // Cache the result (2 minutes - location data changes frequently)
      await cacheSet(cacheKey, { users: privacyShapedUsers, metadata }, 120);

      res.json({
        success: true,
        data: privacyShapedUsers,
        count: privacyShapedUsers.length,
        metadata
      });
    } catch (error) {
      logger.error('Error in getNearbyUsers:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get nearby users'
      });
    }
  }

  // Get nearby listings (with Redis caching)
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

  // Get seller reliability score
  async getSellerReliability(req, res) {
    try {
      const { sellerId } = req.params;

      if (!sellerId || isNaN(parseInt(sellerId))) {
        return res.status(400).json({
          success: false,
          error: 'Valid seller ID is required'
        });
      }

      const reliability = await OptimizationService.getSellerReliability(parseInt(sellerId));

      res.json({
        success: true,
        data: reliability
      });
    } catch (error) {
      logger.error('Error in getSellerReliability:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get seller reliability'
      });
    }
  }

  // Get location demand clusters
  async getDemandClusters(req, res) {
    try {
      const { limit } = req.query;
      let limitValue = parseInt(limit) || 10;
      
      // Enforce max clusters limit
      if (limitValue > 100) {
        limitValue = 100;
      }
      if (limitValue < 1) {
        limitValue = 1;
      }

      const clusters = await OptimizationService.getLocationDemandClusters(limitValue);

      res.json({
        success: true,
        data: clusters,
        count: clusters.length,
        limit: limitValue
      });
    } catch (error) {
      logger.error('Error in getDemandClusters:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get demand clusters'
      });
    }
  }
}

module.exports = new LocationController();
