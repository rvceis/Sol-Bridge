const express = require('express');
const router = express.Router();
const ProfileController = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Profile routes
router.get('/profile', ProfileController.getProfile);
router.put('/profile', ProfileController.updateProfile);

// Address routes
router.get('/addresses', ProfileController.getAddresses);
router.post('/addresses', ProfileController.addAddress);
router.put('/addresses/:id', ProfileController.updateAddress);
router.delete('/addresses/:id', ProfileController.deleteAddress);

// Payment method routes
router.get('/payment-methods', ProfileController.getPaymentMethods);
router.post('/payment-methods', ProfileController.addPaymentMethod);
router.delete('/payment-methods/:id', ProfileController.deletePaymentMethod);

// Document routes
router.get('/documents', ProfileController.getDocuments);
router.post('/documents', ProfileController.uploadDocument);
router.delete('/documents/:id', ProfileController.deleteDocument);

// Preferences routes
router.get('/preferences', ProfileController.getPreferences);
router.put('/preferences', ProfileController.updatePreferences);

module.exports = router;
