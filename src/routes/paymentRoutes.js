const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/config/razorpay-key', PaymentController.getRazorpayKey);

// Webhook (no auth - verified by signature)
router.post('/webhook/razorpay', PaymentController.handleWebhook);

// Protected routes
router.use(authenticate);

// Create payment orders
router.post('/topup/create-order', PaymentController.createTopupOrder);
router.post('/energy/create-order', PaymentController.createEnergyPaymentOrder);

// Verify payment
router.post('/verify', PaymentController.verifyPayment);

// Refunds
router.post('/refund', PaymentController.processRefund);

// Payment history
router.get('/history', PaymentController.getPaymentHistory);
router.get('/:paymentId', PaymentController.getPaymentById);

module.exports = router;
