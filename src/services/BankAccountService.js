/**
 * Bank Account Service
 */

const db = require('../database');
const logger = require('../utils/logger');

class BankAccountService {
  /**
   * Add bank account
   */
  static async addBankAccount(userId, accountData) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const {
        accountHolderName,
        accountNumber,
        ifscCode,
        bankName,
        branchName,
        accountType = 'savings',
      } = accountData;

      // Check if this is the first account (make it primary)
      const countResult = await client.query(
        'SELECT COUNT(*) FROM bank_accounts WHERE user_id = $1',
        [userId]
      );
      const isPrimary = parseInt(countResult.rows[0].count) === 0;

      // If setting as primary, unset other primary accounts
      if (isPrimary) {
        await client.query(
          'UPDATE bank_accounts SET is_primary = false WHERE user_id = $1',
          [userId]
        );
      }

      const query = `
        INSERT INTO bank_accounts (
          user_id, account_holder_name, account_number, ifsc_code,
          bank_name, branch_name, account_type, is_primary
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const result = await client.query(query, [
        userId,
        accountHolderName,
        accountNumber,
        ifscCode,
        bankName,
        branchName,
        accountType,
        isPrimary,
      ]);

      await client.query('COMMIT');

      logger.info(`Bank account added for user ${userId}`);
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding bank account:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user bank accounts
   */
  static async getUserBankAccounts(userId) {
    try {
      const query = `
        SELECT * FROM bank_accounts
        WHERE user_id = $1
        ORDER BY is_primary DESC, created_at DESC
      `;
      
      const result = await db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching bank accounts:', error);
      throw error;
    }
  }

  /**
   * Set primary bank account
   */
  static async setPrimaryAccount(userId, accountId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Unset all primary accounts
      await client.query(
        'UPDATE bank_accounts SET is_primary = false WHERE user_id = $1',
        [userId]
      );

      // Set new primary
      const result = await client.query(
        `UPDATE bank_accounts 
         SET is_primary = true, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [accountId, userId]
      );

      await client.query('COMMIT');

      if (result.rows.length === 0) {
        throw new Error('Bank account not found');
      }

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error setting primary account:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete bank account
   */
  static async deleteBankAccount(userId, accountId) {
    try {
      const result = await db.query(
        'DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2 RETURNING *',
        [accountId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Bank account not found');
      }

      // If deleted account was primary, set another as primary
      if (result.rows[0].is_primary) {
        await db.query(
          `UPDATE bank_accounts 
           SET is_primary = true 
           WHERE user_id = $1 
           ORDER BY created_at ASC 
           LIMIT 1`,
          [userId]
        );
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting bank account:', error);
      throw error;
    }
  }

  /**
   * Admin: Verify bank account
   */
  static async verifyBankAccount(accountId, adminId) {
    try {
      const result = await db.query(
        `UPDATE bank_accounts 
         SET is_verified = true, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [accountId]
      );

      if (result.rows.length === 0) {
        throw new Error('Bank account not found');
      }

      logger.info(`Bank account ${accountId} verified by admin ${adminId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error verifying bank account:', error);
      throw error;
    }
  }
}

module.exports = BankAccountService;
