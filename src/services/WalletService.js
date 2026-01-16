/**
 * Wallet Service
 * Handles wallet operations including balance checks, deposits, and withdrawals
 */

const db = require('../database');
const logger = require('../utils/logger');

class WalletService {
  /**
   * Get user wallet balance
   */
  static async getBalance(userId) {
    try {
      const query = 'SELECT balance FROM wallets WHERE user_id = $1';
      const result = await db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        throw new Error('Wallet not found');
      }

      return {
        balance: parseFloat(result.rows[0].balance) || 0,
      };
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  /**
   * Add funds to wallet
   */
  static async addFunds(userId, amount, description = 'Funds added', client = null) {
    const dbClient = client || await db.getClient();
    const shouldRelease = !client;

    try {
      if (!client) {
        await dbClient.query('BEGIN');
      }

      // Update wallet balance
      const updateQuery = `
        UPDATE wallets 
        SET balance = balance + $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING balance
      `;
      const result = await dbClient.query(updateQuery, [amount, userId]);

      // Create transaction record
      await dbClient.query(
        `INSERT INTO wallet_transactions (
          user_id, type, amount, balance_after, description, status
        ) VALUES ($1, 'credit', $2, $3, $4, 'completed')`,
        [userId, amount, result.rows[0].balance, description]
      );

      if (!client) {
        await dbClient.query('COMMIT');
      }

      logger.info(`Added ₹${amount} to wallet for user ${userId}`);
      return {
        balance: parseFloat(result.rows[0].balance),
        amount: parseFloat(amount),
      };
    } catch (error) {
      if (!client) {
        await dbClient.query('ROLLBACK');
      }
      logger.error('Error adding funds to wallet:', error);
      throw error;
    } finally {
      if (shouldRelease) {
        dbClient.release();
      }
    }
  }

  /**
   * Deduct funds from wallet
   */
  static async deductFunds(userId, amount, description = 'Funds deducted', client = null) {
    const dbClient = client || await db.getClient();
    const shouldRelease = !client;

    try {
      if (!client) {
        await dbClient.query('BEGIN');
      }

      // Check balance
      const balanceResult = await dbClient.query(
        'SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        throw new Error('Wallet not found');
      }

      const currentBalance = parseFloat(balanceResult.rows[0].balance);
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // Update wallet balance
      const updateQuery = `
        UPDATE wallets 
        SET balance = balance - $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING balance
      `;
      const result = await dbClient.query(updateQuery, [amount, userId]);

      // Create transaction record
      await dbClient.query(
        `INSERT INTO wallet_transactions (
          user_id, type, amount, balance_after, description, status
        ) VALUES ($1, 'debit', $2, $3, $4, 'completed')`,
        [userId, -amount, result.rows[0].balance, description]
      );

      if (!client) {
        await dbClient.query('COMMIT');
      }

      logger.info(`Deducted ₹${amount} from wallet for user ${userId}`);
      return {
        balance: parseFloat(result.rows[0].balance),
        amount: parseFloat(amount),
      };
    } catch (error) {
      if (!client) {
        await dbClient.query('ROLLBACK');
      }
      logger.error('Error deducting funds from wallet:', error);
      throw error;
    } finally {
      if (shouldRelease) {
        dbClient.release();
      }
    }
  }

  /**
   * Get wallet transaction history
   */
  static async getTransactions(userId, limit = 50, offset = 0) {
    try {
      const query = `
        SELECT * FROM wallet_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await db.query(query, [userId, limit, offset]);
      
      return result.rows.map(row => ({
        ...row,
        amount: parseFloat(row.amount),
        balance_after: parseFloat(row.balance_after),
      }));
    } catch (error) {
      logger.error('Error getting wallet transactions:', error);
      throw error;
    }
  }

  /**
   * Create or initialize wallet for user
   */
  static async createWallet(userId) {
    try {
      const query = `
        INSERT INTO wallets (user_id, balance)
        VALUES ($1, 0)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING *
      `;
      
      const result = await db.query(query, [userId]);
      
      logger.info(`Wallet created for user ${userId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating wallet:', error);
      throw error;
    }
  }
}

module.exports = WalletService;
