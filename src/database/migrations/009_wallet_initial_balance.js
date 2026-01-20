/**
 * Migration: Add Initial Wallet Balance for Testing
 * Adds ₹10,000 to all existing users for testing transactions
 */

const db = require('../index');
const logger = require('../../utils/logger');

async function up() {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    logger.info('Migration 009: Adding initial wallet balance for all users...');
    
    // Create wallets table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(12, 2) DEFAULT 0.00 CHECK (balance >= 0),
        currency VARCHAR(3) DEFAULT 'INR',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    logger.info('  ✓ Wallets table created/verified');
    
    // Create wallet for each user if not exists
    await client.query(`
      INSERT INTO wallets (user_id, balance)
      SELECT id, 0.00
      FROM users
      WHERE id NOT IN (SELECT user_id FROM wallets)
    `);
    
    logger.info('  ✓ Wallets created for all users');
    
    // Add initial balance of ₹10,000 to all users
    const result = await client.query(`
      UPDATE wallets
      SET balance = balance + 10000.00,
          updated_at = NOW()
      RETURNING user_id, balance
    `);
    
    logger.info(`  ✓ Added ₹10,000 initial balance to ${result.rowCount} users`);
    
    // Create wallet_transactions table for tracking
    await client.query(`
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
    
    logger.info('  ✓ Wallet transactions table created');
    
    // Record initial balance transaction for each user
    await client.query(`
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
    `);
    
    logger.info('  ✓ Recorded initial balance transactions');
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user 
      ON wallet_transactions(user_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet 
      ON wallet_transactions(wallet_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type 
      ON wallet_transactions(transaction_type)
    `);
    
    logger.info('  ✓ Indexes created');
    
    await client.query('COMMIT');
    logger.info('✓ Migration 009 completed successfully');
    
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('✗ Migration 009 failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    logger.info('Rolling back Migration 009...');
    
    // Remove initial balance transactions
    await client.query(`
      DELETE FROM wallet_transactions
      WHERE transaction_type = 'initial_balance'
    `);
    
    // Reset balances to 0
    await client.query(`
      UPDATE wallets
      SET balance = 0.00,
          updated_at = NOW()
    `);
    
    logger.info('  ✓ Removed initial balances');
    
    await client.query('COMMIT');
    logger.info('✓ Migration 009 rollback completed');
    
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('✗ Migration 009 rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
