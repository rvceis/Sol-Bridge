/**
 * Payment Service - Handles Razorpay integration, wallet top-ups, and refunds
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const logger = require('../utils/logger');
const config = require('../config');

class PaymentService {
  constructor() {
    this.testMode = config.payment?.testMode || false;
    
    // Initialize Razorpay (will be null if keys not provided or in test mode)
    this.razorpay = null;
    if (this.testMode) {
      logger.info('💳 PAYMENT TEST MODE ENABLED - Skipping real payments');
    } else if (config.razorpay?.keyId && config.razorpay?.keySecret) {
      this.razorpay = new Razorpay({
        key_id: config.razorpay.keyId,
        key_secret: config.razorpay.keySecret,
      });
      logger.info('Razorpay initialized');
    } else {
      logger.warn('Razorpay keys not configured - payment features disabled');
    }
  }

  /**
   * Create Razorpay order for wallet top-up
   */
  async createTopupOrder(userId, amount, currency = 'INR') {
    try {
      // Minimum amount check
      if (amount < 1) {
        throw new Error('Minimum top-up amount is ₹1');
      }

      // Create payment record
      const paymentId = uuidv4();
      const amountInPaise = Math.round(amount * 100); // Convert to paise

      // TEST MODE: Create mock order
      if (this.testMode) {
        const mockOrderId = `test_order_${Date.now()}`;
        
        await db.query(`
          INSERT INTO payments (
            id, user_id, amount, currency, payment_type, status,
            gateway, gateway_order_id, metadata
          ) VALUES ($1, $2, $3, $4, 'wallet_topup', 'pending', 'razorpay', $5, $6)
        `, [
          paymentId,
          userId,
          amount,
          currency,
          mockOrderId,
          JSON.stringify({ test_mode: true, mock_payment: true, created_at: new Date().toISOString() }),
        ]);

        logger.info({ action: 'test_payment_created', userId, amount, orderId: mockOrderId });

        return {
          payment_id: paymentId,
          order_id: mockOrderId,
          amount: amount,
          currency: currency,
          key_id: 'test_key',
          test_mode: true,
        };
      }

      // PRODUCTION MODE: Create real Razorpay order
      if (!this.razorpay) {
        throw new Error('Payment gateway not configured');
      }

      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: currency,
        receipt: `topup_${paymentId}`,
        notes: {
          user_id: userId,
          payment_id: paymentId,
          type: 'wallet_topup',
        },
      });

      // Store payment record
      await db.query(`
        INSERT INTO payments (
          id, user_id, amount, currency, payment_type, status,
          gateway, gateway_order_id, metadata
        ) VALUES ($1, $2, $3, $4, 'wallet_topup', 'pending', 'razorpay', $5, $6)
      `, [
        paymentId,
        userId,
        amount,
        currency,
        razorpayOrder.id,
        JSON.stringify({ razorpay_order: razorpayOrder }),
      ]);

      logger.info({ action: 'payment_order_created', userId, amount, orderId: razorpayOrder.id });

      return {
        payment_id: paymentId,
        order_id: razorpayOrder.id,
        amount: amount,
        currency: currency,
        key_id: config.razorpay.keyId,
      };
    } catch (error) {
      logger.error('Error creating topup order:', error);
      throw error;
    }
  }

  /**
   * Create payment order for energy purchase
   */
  async createEnergyPaymentOrder(userId, transactionId, amount, currency = 'INR') {
    try {
      if (!this.razorpay) {
        throw new Error('Payment gateway not configured');
      }

      const paymentId = uuidv4();
      const amountInPaise = Math.round(amount * 100);

      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: currency,
        receipt: `energy_${transactionId}`,
        notes: {
          user_id: userId,
          payment_id: paymentId,
          transaction_id: transactionId,
          type: 'energy_purchase',
        },
      });

      await db.query(`
        INSERT INTO payments (
          id, user_id, amount, currency, payment_type, status,
          gateway, gateway_order_id, reference_id, reference_type, metadata
        ) VALUES ($1, $2, $3, $4, 'energy_purchase', 'pending', 'razorpay', $5, $6, 'energy_transaction', $7)
      `, [
        paymentId,
        userId,
        amount,
        currency,
        razorpayOrder.id,
        transactionId,
        JSON.stringify({ razorpay_order: razorpayOrder }),
      ]);

      logger.info({ action: 'energy_payment_created', userId, transactionId, amount });

      return {
        payment_id: paymentId,
        order_id: razorpayOrder.id,
        amount: amount,
        currency: currency,
        key_id: config.razorpay.keyId,
      };
    } catch (error) {
      logger.error('Error creating energy payment order:', error);
      throw error;
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyPaymentSignature(orderId, paymentId, signature) {
    try {
      // Test mode: always valid
      if (this.testMode || orderId.startsWith('test_order_')) {
        logger.info('Test mode: Skipping signature verification');
        return true;
      }

      const generatedSignature = crypto
        .createHmac('sha256', config.razorpay.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      return generatedSignature === signature;
    } catch (error) {
      logger.error('Error verifying payment signature:', error);
      return false;
    }
  }

  /**
   * Handle successful payment (called by webhook or frontend)
   */
  async handlePaymentSuccess(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify signature
      const isValid = this.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
      if (!isValid) {
        throw new Error('Invalid payment signature');
      }

      // Get payment record
      const paymentResult = await client.query(
        'SELECT * FROM payments WHERE gateway_order_id = $1 FOR UPDATE',
        [razorpayOrderId]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error('Payment record not found');
      }

      const payment = paymentResult.rows[0];

      // Check if already processed
      if (payment.status === 'completed') {
        logger.warn({ message: 'Payment already processed', orderId: razorpayOrderId });
        await client.query('COMMIT');
        return { success: true, message: 'Payment already processed' };
      }

      // Update payment record
      await client.query(`
        UPDATE payments
        SET status = 'completed',
            gateway_payment_id = $1,
            completed_at = NOW(),
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{razorpay_payment_id}',
              $2
            )
        WHERE id = $3
      `, [razorpayPaymentId, JSON.stringify(razorpayPaymentId), payment.id]);

      // Handle based on payment type
      if (payment.payment_type === 'wallet_topup') {
        // Credit wallet
        await client.query(`
          UPDATE wallets
          SET balance = balance + $1,
              last_transaction_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $2
        `, [payment.amount, payment.user_id]);

        // Create transaction record
        await client.query(`
          INSERT INTO transactions (
            transaction_type, user_id, amount, description,
            reference_id, reference_type, status, payment_method,
            payment_gateway_txn_id, completed_at
          ) VALUES (
            'wallet_topup', $1, $2, 'Wallet top-up via Razorpay',
            $3, 'payment', 'completed', 'razorpay', $4, NOW()
          )
        `, [payment.user_id, payment.amount, payment.id, razorpayPaymentId]);

        logger.info({ action: 'wallet_topup_completed', userId: payment.user_id, amount: payment.amount });
      } else if (payment.payment_type === 'energy_purchase') {
        // Update energy transaction status
        await client.query(`
          UPDATE energy_transactions
          SET payment_status = 'completed',
              payment_transaction_id = $1,
              status = 'processing',
              updated_at = NOW()
          WHERE id = $2
        `, [razorpayPaymentId, payment.reference_id]);

        // Get transaction details
        const txnResult = await client.query(
          'SELECT * FROM energy_transactions WHERE id = $1',
          [payment.reference_id]
        );
        const energyTxn = txnResult.rows[0];

        // Deduct from buyer's wallet (if using wallet balance)
        await client.query(`
          UPDATE wallets
          SET balance = balance - $1,
              last_transaction_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $2
        `, [energyTxn.total_price, energyTxn.buyer_id]);

        // Credit seller's wallet (minus platform fee)
        const sellerAmount = parseFloat(energyTxn.total_price) - parseFloat(energyTxn.platform_fee);
        await client.query(`
          UPDATE wallets
          SET balance = balance + $1,
              last_transaction_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $2
        `, [sellerAmount, energyTxn.seller_id]);

        logger.info({
          action: 'energy_payment_completed',
          transactionId: payment.reference_id,
          amount: payment.amount,
        });
      }

      await client.query('COMMIT');

      return {
        success: true,
        payment_id: payment.id,
        amount: payment.amount,
        type: payment.payment_type,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error handling payment success:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailure(razorpayOrderId, reason) {
    try {
      await db.query(`
        UPDATE payments
        SET status = 'failed',
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{failure_reason}',
              $1
            ),
            updated_at = NOW()
        WHERE gateway_order_id = $2
      `, [JSON.stringify(reason), razorpayOrderId]);

      logger.warn({ action: 'payment_failed', orderId: razorpayOrderId, reason });
    } catch (error) {
      logger.error('Error handling payment failure:', error);
      throw error;
    }
  }

  /**
   * Process refund
   */
  async processRefund(paymentId, amount = null, reason = 'Customer request') {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Get payment details
      const paymentResult = await client.query(
        'SELECT * FROM payments WHERE id = $1 AND status = $2 FOR UPDATE',
        [paymentId, 'completed']
      );

      if (paymentResult.rows.length === 0) {
        throw new Error('Payment not found or not completed');
      }

      const payment = paymentResult.rows[0];
      const refundAmount = amount || payment.amount;

      if (refundAmount > payment.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
      }

      // Check if already refunded
      const existingRefund = await client.query(
        'SELECT * FROM payments WHERE reference_id = $1 AND payment_type = $2',
        [paymentId, 'refund']
      );

      if (existingRefund.rows.length > 0) {
        throw new Error('Refund already processed');
      }

      // Create refund with Razorpay
      let razorpayRefund = null;
      if (this.razorpay && payment.gateway_payment_id) {
        razorpayRefund = await this.razorpay.payments.refund(payment.gateway_payment_id, {
          amount: Math.round(refundAmount * 100), // Convert to paise
          notes: {
            reason: reason,
            original_payment_id: paymentId,
          },
        });
      }

      // Create refund record
      const refundId = uuidv4();
      await client.query(`
        INSERT INTO payments (
          id, user_id, amount, currency, payment_type, status,
          gateway, gateway_payment_id, reference_id, reference_type,
          metadata, completed_at
        ) VALUES (
          $1, $2, $3, $4, 'refund', 'completed', $5, $6, $7, 'payment', $8, NOW()
        )
      `, [
        refundId,
        payment.user_id,
        refundAmount,
        payment.currency,
        payment.gateway,
        razorpayRefund?.id || null,
        paymentId,
        JSON.stringify({ reason, razorpay_refund: razorpayRefund }),
      ]);

      // Deduct from wallet
      await client.query(`
        UPDATE wallets
        SET balance = balance - $1,
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE user_id = $2
      `, [refundAmount, payment.user_id]);

      // Create transaction record
      await client.query(`
        INSERT INTO transactions (
          transaction_type, user_id, amount, description,
          reference_id, reference_type, status, completed_at
        ) VALUES (
          'refund', $1, $2, $3, $4, 'payment', 'completed', NOW()
        )
      `, [
        payment.user_id,
        -refundAmount,
        `Refund: ${reason}`,
        refundId,
      ]);

      // If energy purchase, update transaction status
      if (payment.payment_type === 'energy_purchase') {
        await client.query(`
          UPDATE energy_transactions
          SET status = 'refunded',
              payment_status = 'refunded',
              updated_at = NOW()
          WHERE id = $1
        `, [payment.reference_id]);
      }

      await client.query('COMMIT');

      logger.info({
        action: 'refund_processed',
        paymentId,
        refundId,
        amount: refundAmount,
      });

      return {
        refund_id: refundId,
        amount: refundAmount,
        razorpay_refund_id: razorpayRefund?.id,
        status: 'completed',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user payment history
   */
  async getPaymentHistory(userId, filters = {}) {
    try {
      const { payment_type, status, limit = 50, offset = 0 } = filters;

      let query = `
        SELECT p.*, u.full_name, u.email
        FROM payments p
        JOIN users u ON p.user_id = u.id
        WHERE p.user_id = $1
      `;

      const params = [userId];
      let paramCount = 2;

      if (payment_type) {
        query += ` AND p.payment_type = $${paramCount}`;
        params.push(payment_type);
        paramCount++;
      }

      if (status) {
        query += ` AND p.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      query += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting payment history:', error);
      throw error;
    }
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId, userId = null) {
    try {
      let query = 'SELECT * FROM payments WHERE id = $1';
      const params = [paymentId];

      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Payment not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting payment:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
