/**
 * Withdrawal Service
 */

const db = require('../database');
const logger = require('../utils/logger');
const WalletService = require('./WalletService');

class WithdrawalService {
  /**
   * Request withdrawal
   */
  static async requestWithdrawal(userId, amount, bankAccountId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Check wallet balance
      const wallet = await WalletService.getBalance(userId);
      if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Check minimum withdrawal amount (₹100)
      if (amount < 100) {
        throw new Error('Minimum withdrawal amount is ₹100');
      }

      // Verify bank account exists and belongs to user
      const bankResult = await client.query(
        'SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2',
        [bankAccountId, userId]
      );

      if (bankResult.rows.length === 0) {
        throw new Error('Bank account not found');
      }

      // Create withdrawal request
      const query = `
        INSERT INTO withdrawal_requests (user_id, bank_account_id, amount, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      `;

      const result = await client.query(query, [userId, bankAccountId, amount]);

      // Deduct from wallet (hold funds)
      await client.query(
        `UPDATE wallets 
         SET balance = balance - $1, updated_at = NOW()
         WHERE user_id = $2`,
        [amount, userId]
      );

      // Create transaction record
      await client.query(
        `INSERT INTO wallet_transactions (
          user_id, type, amount, balance_after, description, status
        ) VALUES ($1, 'withdrawal_request', $2, $3, $4, 'pending')`,
        [
          userId,
          -amount,
          wallet.balance - amount,
          `Withdrawal request of ₹${amount}`,
        ]
      );

      await client.query('COMMIT');

      logger.info(`Withdrawal requested: ₹${amount} by user ${userId}`);
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error requesting withdrawal:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user withdrawal requests
   */
  static async getUserWithdrawals(userId, status = null) {
    try {
      let query = `
        SELECT 
          wr.*,
          ba.bank_name,
          ba.account_number,
          ba.ifsc_code
        FROM withdrawal_requests wr
        JOIN bank_accounts ba ON wr.bank_account_id = ba.id
        WHERE wr.user_id = $1
      `;

      const params = [userId];

      if (status) {
        query += ' AND wr.status = $2';
        params.push(status);
      }

      query += ' ORDER BY wr.requested_at DESC';

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching withdrawals:', error);
      throw error;
    }
  }

  /**
   * Admin: Approve withdrawal
   */
  static async approveWithdrawal(withdrawalId, adminId, transactionId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get withdrawal details
      const withdrawalResult = await client.query(
        'SELECT * FROM withdrawal_requests WHERE id = $1',
        [withdrawalId]
      );

      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal request not found');
      }

      const withdrawal = withdrawalResult.rows[0];

      if (withdrawal.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }

      // Update withdrawal status
      await client.query(
        `UPDATE withdrawal_requests 
         SET status = 'completed', processed_at = NOW(), 
             processed_by = $1, transaction_id = $2, updated_at = NOW()
         WHERE id = $3`,
        [adminId, transactionId, withdrawalId]
      );

      // Update wallet transaction status
      await client.query(
        `UPDATE wallet_transactions 
         SET status = 'completed', metadata = jsonb_set(metadata, '{transaction_id}', $1)
         WHERE user_id = $2 
         AND type = 'withdrawal_request' 
         AND amount = $3 
         AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [`"${transactionId}"`, withdrawal.user_id, -withdrawal.amount]
      );

      await client.query('COMMIT');

      logger.info(`Withdrawal ${withdrawalId} approved by admin ${adminId}`);
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error approving withdrawal:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Admin: Reject withdrawal
   */
  static async rejectWithdrawal(withdrawalId, adminId, reason) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get withdrawal details
      const withdrawalResult = await client.query(
        'SELECT * FROM withdrawal_requests WHERE id = $1',
        [withdrawalId]
      );

      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal request not found');
      }

      const withdrawal = withdrawalResult.rows[0];

      if (withdrawal.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }

      // Update withdrawal status
      await client.query(
        `UPDATE withdrawal_requests 
         SET status = 'rejected', processed_at = NOW(), 
             processed_by = $1, rejection_reason = $2, updated_at = NOW()
         WHERE id = $3`,
        [adminId, reason, withdrawalId]
      );

      // Refund to wallet
      await client.query(
        `UPDATE wallets 
         SET balance = balance + $1, updated_at = NOW()
         WHERE user_id = $2`,
        [withdrawal.amount, withdrawal.user_id]
      );

      // Update wallet transaction
      await client.query(
        `UPDATE wallet_transactions 
         SET status = 'failed', description = description || ' (Rejected: ' || $1 || ')'
         WHERE user_id = $2 
         AND type = 'withdrawal_request' 
         AND amount = $3 
         AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [reason, withdrawal.user_id, -withdrawal.amount]
      );

      await client.query('COMMIT');

      logger.info(`Withdrawal ${withdrawalId} rejected by admin ${adminId}`);
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error rejecting withdrawal:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Admin: Get pending withdrawals
   */
  static async getPendingWithdrawals() {
    try {
      const query = `
        SELECT 
          wr.*,
          u.email as user_email,
          u.name as user_name,
          ba.bank_name,
          ba.account_holder_name,
          ba.account_number,
          ba.ifsc_code
        FROM withdrawal_requests wr
        JOIN users u ON wr.user_id = u.id
        JOIN bank_accounts ba ON wr.bank_account_id = ba.id
        WHERE wr.status = 'pending'
        ORDER BY wr.requested_at ASC
      `;

      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching pending withdrawals:', error);
      throw error;
    }
  }
}

module.exports = WithdrawalService;
