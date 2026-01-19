const db = require('./index');
const logger = require('../utils/logger');

// Define all migrations here (idempotent operations)
const migrations = [
  {
    id: '001-fix-host-capacity-constraint',
    description: 'Fix solar_capacity_kw constraint to allow 0 value',
    up: async (client) => {
      try {
        // Drop existing constraint if it exists
        await client.query(`
          ALTER TABLE hosts DROP CONSTRAINT IF EXISTS hosts_solar_capacity_kw_check
        `);
        
        // Add new constraint allowing >= 0
        await client.query(`
          ALTER TABLE hosts ADD CONSTRAINT hosts_solar_capacity_kw_check 
          CHECK (solar_capacity_kw >= 0)
        `);
        
        logger.info('✓ Migration 001: Fixed host solar_capacity_kw constraint');
        return true;
      } catch (error) {
        logger.warn(`Migration 001 already applied or skipped: ${error.message}`);
        return true; // Don't fail if already applied
      }
    }
  },
  {
    id: '002-fix-investor-capital-constraint',
    description: 'Fix total_capital constraint to allow 0 value',
    up: async (client) => {
      try {
        // Drop existing constraint if it exists
        await client.query(`
          ALTER TABLE investors DROP CONSTRAINT IF EXISTS investors_total_capital_check
        `);
        
        // Add new constraint allowing >= 0
        await client.query(`
          ALTER TABLE investors ADD CONSTRAINT investors_total_capital_check 
          CHECK (total_capital >= 0)
        `);
        
        logger.info('✓ Migration 002: Fixed investor total_capital constraint');
        return true;
      } catch (error) {
        logger.warn(`Migration 002 already applied or skipped: ${error.message}`);
        return true;
      }
    }
  },
  {
    id: '003-add-device-fields',
    description: 'Add device fields (device_name, capacity_kwh, efficiency_rating, metadata) to devices table',
    up: async (client) => {
      try {
        // Check if device_name already exists
        const columnCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'device_name'
        `);

        if (columnCheck.rows.length === 0) {
          // Add missing columns
          await client.query(`
            ALTER TABLE devices
            ADD COLUMN IF NOT EXISTS device_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS capacity_kwh DECIMAL(10, 2),
            ADD COLUMN IF NOT EXISTS efficiency_rating DECIMAL(5, 2),
            ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
          `);

          logger.info('✓ Migration 003: Added device fields successfully');
        } else {
          logger.info('✓ Migration 003: Device fields already exist, skipping');
        }
        
        return true;
      } catch (error) {
        logger.warn(`Migration 003 error: ${error.message}`);
        // Don't fail if columns already exist
        if (error.message.includes('already exists')) {
          return true;
        }
        throw error;
      }
    }
  }
];

const runMigrations = async (client = null) => {
  const useProvidedClient = !!client;
  
  if (!useProvidedClient) {
    client = await db.pool.connect();
  }

  try {
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(50) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    let appliedCount = 0;

    for (const migration of migrations) {
      try {
        // Check if migration already applied
        const result = await client.query(
          'SELECT id FROM schema_migrations WHERE id = $1',
          [migration.id]
        );

        if (result.rows.length === 0) {
          // Run migration
          await migration.up(client);

          // Record migration
          await client.query(
            'INSERT INTO schema_migrations (id) VALUES ($1)',
            [migration.id]
          );

          appliedCount++;
          logger.info(`Applied migration: ${migration.id} - ${migration.description}`);
        }
      } catch (error) {
        logger.warn(`Error running migration ${migration.id}: ${error.message}`);
        // Continue with next migration instead of failing
      }
    }

    if (appliedCount > 0) {
      logger.info(`✓ ${appliedCount} migration(s) applied successfully`);
    } else {
      logger.info('✓ All migrations already applied');
    }

    return true;
  } catch (error) {
    logger.error('Migration system error:', error);
    throw error;
  } finally {
    if (!useProvidedClient) {
      client.release();
    }
  }
};

module.exports = {
  migrations,
  runMigrations
};
