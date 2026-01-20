/**
 * Initialize Wallet Balances
 * Run this after database is connected
 */

const db = require('../database');
const logger = require('../utils/logger');

async function initializeWalletBalances() {
  try {
    logger.info('Initializing wallet balances...');

    // Create wallets table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(12, 2) DEFAULT 0.00 CHECK (balance >= 0),
        currency VARCHAR(3) DEFAULT 'INR',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create wallet_transactions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        transaction_type VARCHAR(50) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        balance_before DECIMAL(12, 2),
        balance_after DECIMAL(12, 2),
        description TEXT,
        reference_id UUID,
        reference_type VARCHAR(50),
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user 
      ON wallet_transactions(user_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet 
      ON wallet_transactions(wallet_id)
    `);

    logger.info('✓ Wallet tables created');

    // Create wallets for users without one
    const walletResult = await db.query(`
      INSERT INTO wallets (user_id, balance)
      SELECT id, 10000.00
      FROM users
      WHERE id NOT IN (SELECT user_id FROM wallets WHERE user_id IS NOT NULL)
      RETURNING user_id
    `);

    if (walletResult.rowCount > 0) {
      logger.info(`✓ Created ${walletResult.rowCount} wallets with ₹10,000 initial balance`);

      // Record initial balance transactions
      await db.query(`
        INSERT INTO wallet_transactions (
          wallet_id,
          user_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          description,
          status
        )
        SELECT 
          w.id,
          w.user_id,
          'initial_balance',
          10000.00,
          0.00,
          10000.00,
          'Initial testing balance',
          'completed'
        FROM wallets w
        WHERE w.user_id IN (
          SELECT id FROM users
          WHERE id NOT IN (
            SELECT user_id FROM wallet_transactions 
            WHERE transaction_type = 'initial_balance'
          )
        )
      `);

      logger.info('✓ Recorded initial balance transactions');
    } else {
      logger.info('✓ All users already have wallets');
    }

    return true;
  } catch (error) {
    logger.error('Failed to initialize wallet balances:', error);
    return false;
  }
}

module.exports = { initializeWalletBalances };
