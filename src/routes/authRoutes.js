const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/verify-email', authController.verifyEmail);
router.post('/auth/password-reset-request', authController.requestPasswordReset);
router.post('/auth/password-reset', authController.resetPassword);
router.post('/auth/refresh-token', authController.refreshAccessToken);

// Protected routes
router.get('/users/profile', authenticate, authController.getProfile);
router.put('/users/profile', authenticate, authController.updateProfile);

module.exports = router;
