const MarketplaceService = require('../services/MarketplaceService');
const logger = require('../utils/logger');

class MarketplaceController {
  // Create listing
  async createListing(req, res) {
    try {
      const userId = req.user.id;
      const listingData = req.body;
      
      const listing = await MarketplaceService.createListing(userId, listingData);
      
      res.status(201).json({
        success: true,
        message: 'Listing created successfully',
        data: listing
      });
    } catch (error) {
      logger.error('Error in createListing:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create listing'
      });
    }
  }

  // Get all listings
  async getListings(req, res) {
    try {
      const filters = {
        min_price: req.query.min_price,
        max_price: req.query.max_price,
        min_energy: req.query.min_energy,
        max_energy: req.query.max_energy,
        listing_type: req.query.listing_type,
        renewable_only: req.query.renewable_only === 'true',
        seller_id: req.query.seller_id,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };
      
      const listings = await MarketplaceService.getListings(filters);
      
      res.json({
        success: true,
        data: listings,
        count: listings.length
      });
    } catch (error) {
      logger.error('Error in getListings:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get listings'
      });
    }
  }

  // Get listing by ID
  async getListingById(req, res) {
    try {
      const { id } = req.params;
      const listing = await MarketplaceService.getListingById(id);
      
      res.json({
        success: true,
        data: listing
      });
    } catch (error) {
      logger.error('Error in getListingById:', error);
      res.status(404).json({
        success: false,
        error: error.message || 'Listing not found'
      });
    }
  }

  // Update listing
  async updateListing(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const updates = req.body;
      
      const listing = await MarketplaceService.updateListing(userId, id, updates);
      
      res.json({
        success: true,
        message: 'Listing updated successfully',
        data: listing
      });
    } catch (error) {
      logger.error('Error in updateListing:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update listing'
      });
    }
  }

  // Delete listing
  async deleteListing(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      await MarketplaceService.deleteListing(userId, id);
      
      res.json({
        success: true,
        message: 'Listing cancelled successfully'
      });
    } catch (error) {
      logger.error('Error in deleteListing:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete listing'
      });
    }
  }

  // Get my listings
  async getMyListings(req, res) {
    try {
      const userId = req.user.id;
      const filters = {
        seller_id: userId,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };
      
      const listings = await MarketplaceService.getListings(filters);
      
      res.json({
        success: true,
        data: listings,
        count: listings.length
      });
    } catch (error) {
      logger.error('Error in getMyListings:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get your listings'
      });
    }
  }

  // Create transaction (buy energy)
  async buyEnergy(req, res) {
    try {
      const buyerId = req.user.id;
      const transactionData = req.body;
      
      const transaction = await MarketplaceService.createTransaction(buyerId, transactionData);
      
      res.status(201).json({
        success: true,
        message: 'Purchase successful',
        data: transaction
      });
    } catch (error) {
      logger.error('Error in buyEnergy:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to complete purchase'
      });
    }
  }

  // Get user transactions
  async getMyTransactions(req, res) {
    try {
      const userId = req.user.id;
      const role = req.query.role || 'buyer'; // 'buyer' or 'seller'
      
      const transactions = await MarketplaceService.getUserTransactions(userId, role);
      
      res.json({
        success: true,
        data: transactions,
        count: transactions.length
      });
    } catch (error) {
      logger.error('Error in getMyTransactions:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get transactions'
      });
    }
  }

  // Get transaction by ID
  async getTransactionById(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      const transaction = await MarketplaceService.getTransactionById(id, userId);
      
      res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      logger.error('Error in getTransactionById:', error);
      res.status(404).json({
        success: false,
        error: error.message || 'Transaction not found'
      });
    }
  }

  // Update transaction status
  async updateTransactionStatus(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const updates = req.body;
      
      const transaction = await MarketplaceService.updateTransactionStatus(id, userId, updates);
      
      res.json({
        success: true,
        message: 'Transaction updated successfully',
        data: transaction
      });
    } catch (error) {
      logger.error('Error in updateTransactionStatus:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update transaction'
      });
    }
  }

  // Get market statistics
  async getMarketStatistics(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      const statistics = await MarketplaceService.getMarketStatistics(days);
      
      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      logger.error('Error in getMarketStatistics:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get market statistics'
      });
    }
  }
}

module.exports = new MarketplaceController();
