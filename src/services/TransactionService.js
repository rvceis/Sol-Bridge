const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const logger = require('../utils/logger');
const { cacheSet, cacheGet, cacheDel } = require('../utils/cache');

class TransactionService {
  // Record energy transaction
  async recordEnergyTransaction(hostId, buyerId, energyKwh, pricePerKwh, allocationId) {
    try {
      const totalAmount = energyKwh * pricePerKwh;
      const hostShare = totalAmount * 0.45; // 45% to host
      const platformFee = totalAmount * 0.20; // 20% platform
      const investorShare = totalAmount * 0.35; // 35% to investors

      return await db.transaction(async (client) => {
        // Create transaction record
        const transactionId = uuidv4();
        await client.query(
          `INSERT INTO transactions 
           (id, transaction_type, user_id, amount, description, reference_id, reference_type, status)
           VALUES ($1, 'energy_sale', $2, $3, $4, $5, 'allocation', 'pending')`,
          [
            transactionId,
            hostId,
            totalAmount,
            `Energy sale: ${energyKwh} kWh to buyer`,
            allocationId,
          ]
        );

        // Debit buyer's wallet
        await client.query(
          `UPDATE wallets 
           SET balance = balance - $1, last_transaction_at = NOW()
           WHERE user_id = $2`,
          [totalAmount, buyerId]
        );

        // Credit host's wallet
        await client.query(
          `UPDATE wallets 
           SET balance = balance + $1, last_transaction_at = NOW()
           WHERE user_id = $2`,
          [hostShare, hostId]
        );

        // Get host's investors
        const investorsResult = await client.query(
          `SELECT investor_id, investment_amount
           FROM investor_allocations
           WHERE host_id = $1 AND status = 'active'`,
          [hostId]
        );

        // Distribute investor shares
        if (investorsResult.rows.length > 0) {
          const totalInvestment = investorsResult.rows.reduce(
            (sum, row) => sum + parseFloat(row.investment_amount),
            0
          );

          for (const investor of investorsResult.rows) {
            const investorProportion = investor.investment_amount / totalInvestment;
            const investorReturn = investorShare * investorProportion;

            await client.query(
              `UPDATE wallets 
               SET balance = balance + $1, last_transaction_at = NOW()
               WHERE user_id = $2`,
              [investorReturn, investor.investor_id]
            );
          }
        }

        // Credit platform account
        const platformUserId = await this.getPlatformUserId();
        if (platformUserId) {
          await client.query(
            `UPDATE wallets 
             SET balance = balance + $1, last_transaction_at = NOW()
             WHERE user_id = $2`,
            [platformFee, platformUserId]
          );
        }

        // Update allocation status
        await client.query(
          `UPDATE allocations 
           SET actual_energy_kwh = $1, status = 'executed'
           WHERE id = $2`,
          [energyKwh, allocationId]
        );

        // Clear wallet cache
        await cacheDel(`wallet:${buyerId}`);
        await cacheDel(`wallet:${hostId}`);

        return {
          transactionId,
          totalAmount,
          hostShare,
          investorShare,
          platformFee,
          timestamp: new Date().toISOString(),
        };
      });
    } catch (error) {
      logger.error('Error recording energy transaction:', error);
      throw error;
    }
  }

  // Process wallet top-up (payment gateway integration)
  async processWalletTopup(userId, amount, paymentMethod, paymentGatewayTxnId) {
    try {
      return await db.transaction(async (client) => {
        const transactionId = uuidv4();

        // Get balance before
        const balanceBefore = await client.query(
          'SELECT balance FROM wallets WHERE user_id = $1',
          [userId]
        );

        const balanceBeforeAmount = balanceBefore.rows[0]?.balance || 0;
        const balanceAfter = balanceBeforeAmount + amount;

        // Update wallet
        await client.query(
          `UPDATE wallets 
           SET balance = balance + $1, last_transaction_at = NOW()
           WHERE user_id = $2`,
          [amount, userId]
        );

        // Record transaction
        await client.query(
          `INSERT INTO transactions 
           (id, transaction_type, user_id, amount, balance_before, balance_after, 
            status, payment_method, payment_gateway_txn_id)
           VALUES ($1, 'wallet_topup', $2, $3, $4, $5, 'completed', $6, $7)`,
          [
            transactionId,
            userId,
            amount,
            balanceBeforeAmount,
            balanceAfter,
            paymentMethod,
            paymentGatewayTxnId,
          ]
        );

        // Clear cache
        await cacheDel(`wallet:${userId}`);

        return {
          transactionId,
          previousBalance: balanceBeforeAmount,
          amount,
          newBalance: balanceAfter,
          timestamp: new Date().toISOString(),
        };
      });
    } catch (error) {
      logger.error('Error processing wallet top-up:', error);
      throw error;
    }
  }

  // Process withdrawal
  async processWithdrawal(userId, amount, bankAccount) {
    try {
      return await db.transaction(async (client) => {
        // Check balance
        const balanceResult = await client.query(
          'SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE',
          [userId]
        );

        const balance = balanceResult.rows[0]?.balance || 0;

        if (balance < amount) {
          throw new Error('Insufficient balance');
        }

        const transactionId = uuidv4();
        const fee = amount * 0.01; // 1% withdrawal fee
        const netAmount = amount - fee;

        // Deduct from wallet
        await client.query(
          `UPDATE wallets 
           SET balance = balance - $1, last_transaction_at = NOW()
           WHERE user_id = $2`,
          [amount, userId]
        );

        // Record transaction
        await client.query(
          `INSERT INTO transactions 
           (id, transaction_type, user_id, amount, balance_before, balance_after, 
            status, description)
           VALUES ($1, 'withdrawal', $2, $3, $4, $5, 'pending', $6)`,
          [
            transactionId,
            userId,
            netAmount,
            balance,
            balance - amount,
            `Withdrawal to account ending in ${bankAccount.last4}`,
          ]
        );

        // TODO: Call payment gateway to process payout

        // Clear cache
        await cacheDel(`wallet:${userId}`);

        return {
          transactionId,
          withdrawalAmount: amount,
          fee,
          netAmount,
          status: 'pending',
          timestamp: new Date().toISOString(),
        };
      });
    } catch (error) {
      logger.error('Error processing withdrawal:', error);
      throw error;
    }
  }

  // Get user wallet balance
  async getWalletBalance(userId) {
    try {
      const cacheKey = `wallet:${userId}`;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return cached;
      }

      const result = await db.query(
        'SELECT balance, last_transaction_at FROM wallets WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Wallet not found');
      }

      const wallet = result.rows[0];
      await cacheSet(cacheKey, wallet, 300); // Cache for 5 minutes

      return wallet;
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  // Get transaction history
  async getTransactionHistory(userId, limit = 100, offset = 0) {
    try {
      const result = await db.query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  }

  // Calculate daily settlement
  async calculateDailySettlement(date) {
    try {
      // Get all transactions for the day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Aggregate by user
      const result = await db.query(
        `SELECT 
          user_id,
          SUM(CASE WHEN transaction_type IN ('energy_sale', 'wallet_topup') THEN amount ELSE 0 END) as total_credits,
          SUM(CASE WHEN transaction_type IN ('withdrawal') THEN amount ELSE 0 END) as total_debits,
          COUNT(*) as transaction_count
         FROM transactions
         WHERE created_at BETWEEN $1 AND $2
         GROUP BY user_id`,
        [startOfDay, endOfDay]
      );

      // Create statements
      for (const row of result.rows) {
        const netAmount = (row.total_credits || 0) - (row.total_debits || 0);

        await db.query(
          `INSERT INTO daily_statements 
           (user_id, statement_date, total_cost_or_earnings, transaction_data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, statement_date) DO UPDATE
           SET total_cost_or_earnings = $3, statement_data = $4`,
          [
            row.user_id,
            date,
            netAmount,
            JSON.stringify({
              credits: row.total_credits,
              debits: row.total_debits,
              transactions: row.transaction_count,
            }),
          ]
        );
      }

      return result.rows;
    } catch (error) {
      logger.error('Error calculating daily settlement:', error);
      throw error;
    }
  }

  // Get platform metrics
  async getPlatformMetrics(startDate, endDate) {
    try {
      const result = await db.query(
        `SELECT 
          COUNT(DISTINCT user_id) as unique_users,
          SUM(amount) as total_volume,
          AVG(amount) as average_transaction,
          COUNT(*) as transaction_count
         FROM transactions
         WHERE created_at BETWEEN $1 AND $2
         AND status = 'completed'`,
        [startDate, endDate]
      );

      return result.rows[0] || {};
    } catch (error) {
      logger.error('Error getting platform metrics:', error);
      throw error;
    }
  }

  // Helper: Get platform user ID
  async getPlatformUserId() {
    try {
      const result = await db.query(
        "SELECT id FROM users WHERE role = 'admin' AND email = $1",
        ['admin@solarsharingplatform.com']
      );

      return result.rows[0]?.id || null;
    } catch (error) {
      logger.error('Error getting platform user ID:', error);
      return null;
    }
  }

  // Refund transaction
  async refundTransaction(transactionId, reason) {
    try {
      return await db.transaction(async (client) => {
        // Get original transaction
        const txnResult = await client.query(
          'SELECT * FROM transactions WHERE id = $1',
          [transactionId]
        );

        if (txnResult.rows.length === 0) {
          throw new Error('Transaction not found');
        }

        const originalTxn = txnResult.rows[0];

        // Create refund transaction
        const refundId = uuidv4();
        await client.query(
          `INSERT INTO transactions 
           (id, transaction_type, user_id, amount, description, reference_id, 
            reference_type, status)
           VALUES ($1, 'refund', $2, $3, $4, $5, 'transaction', 'completed')`,
          [
            refundId,
            originalTxn.user_id,
            originalTxn.amount,
            `Refund: ${reason}`,
            transactionId,
          ]
        );

        // Update wallet
        await client.query(
          `UPDATE wallets 
           SET balance = balance + $1
           WHERE user_id = $2`,
          [originalTxn.amount, originalTxn.user_id]
        );

        // Mark original as refunded
        await client.query(
          'UPDATE transactions SET status = $1 WHERE id = $2',
          ['cancelled', transactionId]
        );

        await cacheDel(`wallet:${originalTxn.user_id}`);

        return {
          refundId,
          originalTransactionId: transactionId,
          amount: originalTxn.amount,
          reason,
          timestamp: new Date().toISOString(),
        };
      });
    } catch (error) {
      logger.error('Error refunding transaction:', error);
      throw error;
    }
  }
}

module.exports = new TransactionService();
