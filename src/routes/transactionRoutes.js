const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticate, authorize } = require('../middleware/auth');

// Protected routes (all require authentication)
router.get('/wallet', authenticate, transactionController.getWalletBalance);
router.get('/transactions', authenticate, transactionController.getTransactionHistory);
router.post('/wallet/topup', authenticate, transactionController.topupWallet);
router.post('/wallet/withdraw', authenticate, transactionController.requestWithdrawal);

// Callback from payment gateway
router.post('/payment/callback', transactionController.processPaymentCallback);

// Admin routes
router.get('/admin/metrics', authenticate, authorize('admin'), transactionController.getPlatformMetrics);

module.exports = router;
