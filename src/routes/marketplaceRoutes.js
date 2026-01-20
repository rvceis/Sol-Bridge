const express = require('express');
const router = express.Router();
const MarketplaceController = require('../controllers/marketplaceController');
const { authenticate } = require('../middleware/auth');

// Public routes (anyone can view listings)
router.get('/listings', MarketplaceController.getListings);
router.get('/nearby-listings', MarketplaceController.getNearbyListings);
router.get('/listings/:id', MarketplaceController.getListingById);
router.get('/statistics', MarketplaceController.getMarketStatistics);

// Protected routes (require authentication)
router.use(authenticate);

// Listing management (seller)
router.post('/listings', MarketplaceController.createListing);
router.put('/listings/:id', MarketplaceController.updateListing);
router.delete('/listings/:id', MarketplaceController.deleteListing);
router.get('/my-listings', MarketplaceController.getMyListings);

// Transaction management (buyer/seller)
router.post('/transactions', MarketplaceController.buyEnergy);
router.get('/transactions', MarketplaceController.getMyTransactions);
router.get('/transactions/:id', MarketplaceController.getTransactionById);
router.put('/transactions/:id', MarketplaceController.updateTransactionStatus);

// AI Matching
router.get('/ai-matches', MarketplaceController.getAIMatches);

module.exports = router;
