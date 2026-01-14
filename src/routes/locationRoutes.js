const express = require('express');
const router = express.Router();
const LocationController = require('../controllers/locationController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/nearby-users', (req, res) => LocationController.getNearbyUsers(req, res));
router.get('/nearby-listings', (req, res) => LocationController.getNearbyListings(req, res));
router.get('/heatmap', (req, res) => LocationController.getEnergyHeatmap(req, res));
router.get('/demand-prediction', (req, res) => LocationController.getDemandPrediction(req, res));

// Protected routes (require authentication)
router.use(authenticate);

router.put('/update', (req, res) => LocationController.updateLocation(req, res));
router.post('/optimal-allocation', (req, res) => LocationController.getOptimalAllocation(req, res));
router.get('/pricing-recommendation', (req, res) => LocationController.getPricingRecommendation(req, res));
router.get('/investment-opportunities', (req, res) => LocationController.getInvestmentOpportunities(req, res));

module.exports = router;
