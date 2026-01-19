/**
 * Migration: Add device fields for enhanced device management
 * ID: 003-add-device-fields
 * Description: Add device_name, capacity_kwh, efficiency_rating, and metadata columns to devices table
 */

module.exports = {
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

        console.log('✓ Migration 003: Added device fields successfully');
      } else {
        console.log('✓ Migration 003: Device fields already exist, skipping');
      }
      
      return true;
    } catch (error) {
      console.warn(`Migration 003 error: ${error.message}`);
      // Don't fail if columns already exist
      if (error.message.includes('already exists')) {
        return true;
      }
      throw error;
    }
  }
};
