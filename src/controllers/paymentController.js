/**
 * Payment Controller - Handles payment-related API requests
 */

const PaymentService = require('../services/PaymentService');
const { asyncHandler } = require('../utils/errors');
const { schemas, validate } = require('../utils/validation');
const logger = require('../utils/logger');

// Create wallet top-up order
const createTopupOrder = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.walletTopup);
  const userId = req.user.id;

  const order = await PaymentService.createTopupOrder(userId, data.amount, data.currency || 'INR');

  logger.info({ action: 'topup_order_created', userId, amount: data.amount });
  res.success(order, 'Top-up order created successfully', 201);
});

// Create energy purchase payment order
const createEnergyPaymentOrder = asyncHandler(async (req, res) => {
  const { transaction_id, amount } = req.body;

  if (!transaction_id || !amount) {
    return res.error('ValidationError', 'Transaction ID and amount required', 400);
  }

  const userId = req.user.id;
  const order = await PaymentService.createEnergyPaymentOrder(
    userId,
    transaction_id,
    amount,
    req.body.currency || 'INR'
  );

  logger.info({ action: 'energy_payment_order_created', userId, transactionId: transaction_id });
  res.success(order, 'Payment order created successfully', 201);
});

// Verify payment (called by frontend after Razorpay payment)
const verifyPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.error('ValidationError', 'Missing payment verification data', 400);
  }

  const result = await PaymentService.handlePaymentSuccess(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );

  logger.info({
    action: 'payment_verified',
    userId: req.user.id,
    orderId: razorpay_order_id,
  });

  res.success(result, 'Payment verified successfully');
});

// Test mode: Complete payment without Razorpay (only in test mode)
const testCompletePayment = asyncHandler(async (req, res) => {
  const config = require('../config');
  
  if (!config.payment?.testMode) {
    return res.error('ForbiddenError', 'Test mode is not enabled', 403);
  }

  const { order_id } = req.body;

  if (!order_id) {
    return res.error('ValidationError', 'order_id is required', 400);
  }

  // Generate test payment ID
  const testPaymentId = `test_pay_${Date.now()}`;
  const testSignature = 'test_signature_valid';

  logger.info({
    action: 'test_payment_completed',
    userId: req.user.id,
    orderId: order_id,
    mode: 'TEST',
  });

  // Process as successful payment
  const result = await PaymentService.handlePaymentSuccess(
    order_id,
    testPaymentId,
    testSignature
  );

  res.success({
    ...result,
    test_mode: true,
    razorpay_payment_id: testPaymentId,
    razorpay_order_id: order_id,
    razorpay_signature: testSignature,
  }, 'Test payment completed successfully');
});

// Razorpay webhook handler
const handleWebhook = asyncHandler(async (req, res) => {
  const event = req.body;

  // Verify webhook signature (if configured)
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers['x-razorpay-signature'];
    const crypto = require('crypto');
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn({ message: 'Invalid webhook signature' });
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  logger.info({ event: 'razorpay_webhook', type: event.event });

  try {
    switch (event.event) {
      case 'payment.captured':
        // Payment successful
        const payment = event.payload.payment.entity;
        await PaymentService.handlePaymentSuccess(
          payment.order_id,
          payment.id,
          null // Signature not needed for webhook
        );
        break;

      case 'payment.failed':
        // Payment failed
        const failedPayment = event.payload.payment.entity;
        await PaymentService.handlePaymentFailure(
          failedPayment.order_id,
          failedPayment.error_description || 'Payment failed'
        );
        break;

      case 'refund.created':
        // Refund processed
        logger.info({ message: 'Refund webhook received', refundId: event.payload.refund.entity.id });
        break;

      default:
        logger.info({ message: 'Unhandled webhook event', event: event.event });
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Process refund
const processRefund = asyncHandler(async (req, res) => {
  const { payment_id, amount, reason } = req.body;

  if (!payment_id) {
    return res.error('ValidationError', 'Payment ID required', 400);
  }

  // Verify user owns the payment or is admin
  const payment = await PaymentService.getPaymentById(payment_id);
  
  if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.error('AuthorizationError', 'Not authorized to refund this payment', 403);
  }

  const result = await PaymentService.processRefund(
    payment_id,
    amount,
    reason || 'Customer request'
  );

  logger.info({
    action: 'refund_initiated',
    userId: req.user.id,
    paymentId: payment_id,
    amount: amount || payment.amount,
  });

  res.success(result, 'Refund processed successfully');
});

// Get payment history
const getPaymentHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const filters = {
    payment_type: req.query.payment_type,
    status: req.query.status,
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0,
  };

  const payments = await PaymentService.getPaymentHistory(userId, filters);

  logger.info({ action: 'payment_history_fetched', userId, count: payments.length });
  res.success(payments, 'Payment history retrieved successfully');
});

// Get payment by ID
const getPaymentById = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const userId = req.user.id;

  const payment = await PaymentService.getPaymentById(paymentId, userId);

  logger.info({ action: 'payment_fetched', userId, paymentId });
  res.success(payment, 'Payment retrieved successfully');
});

// Get Razorpay key (public key for frontend)
const getRazorpayKey = asyncHandler(async (req, res) => {
  const config = require('../config');
  const keyId = process.env.RAZORPAY_KEY_ID;

  // Return test mode status
  if (config.payment?.testMode) {
    return res.success({ 
      key_id: 'test_key', 
      test_mode: true 
    }, 'Test mode enabled - No real payment required');
  }

  if (!keyId) {
    return res.error('ConfigurationError', 'Payment gateway not configured', 503);
  }

  res.success({ key_id: keyId, test_mode: false }, 'Razorpay key retrieved');
});

module.exports = {
  createTopupOrder,
  createEnergyPaymentOrder,
  verifyPayment,
  testCompletePayment,
  handleWebhook,
  processRefund,
  getPaymentHistory,
  getPaymentById,
  getRazorpayKey,
};
