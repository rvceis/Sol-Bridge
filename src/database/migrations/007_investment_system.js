/**
 * Database Migration: Investment System Tables
 * Creates tables for investments, host spaces, industries, contracts
 */

const { Pool } = require('pg');

async function up(db) {
  console.log('Running migration: Investment system tables...');

  // Host Spaces Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS host_spaces (
      id SERIAL PRIMARY KEY,
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      property_type VARCHAR(50) NOT NULL CHECK (property_type IN ('rooftop', 'ground', 'both')),
      available_area_sqft DECIMAL(10, 2) NOT NULL,
      total_capacity_kw DECIMAL(10, 2) NOT NULL,
      available_capacity_kw DECIMAL(10, 2) NOT NULL,
      address TEXT NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      pincode VARCHAR(10) NOT NULL,
      latitude DECIMAL(10, 7),
      longitude DECIMAL(10, 7),
      monthly_rent_per_kw DECIMAL(10, 2) NOT NULL,
      has_structural_certificate BOOLEAN DEFAULT false,
      structural_certificate_url TEXT,
      is_near_industry BOOLEAN DEFAULT false,
      distance_to_nearest_industry_km DECIMAL(10, 2),
      property_images JSONB DEFAULT '[]',
      status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'full', 'inactive')),
      property_rating DECIMAL(3, 2) DEFAULT 4.5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_host_spaces_host_id ON host_spaces(host_id);
    CREATE INDEX IF NOT EXISTS idx_host_spaces_location ON host_spaces(city, state);
    CREATE INDEX IF NOT EXISTS idx_host_spaces_available ON host_spaces(available_capacity_kw) WHERE status = 'available';
  `);

  // Investments Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS investments (
      id SERIAL PRIMARY KEY,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_space_id INTEGER NOT NULL REFERENCES host_spaces(id) ON DELETE CASCADE,
      panel_capacity_kw DECIMAL(10, 2) NOT NULL,
      investment_amount DECIMAL(12, 2) NOT NULL,
      monthly_production_kwh DECIMAL(10, 2) NOT NULL,
      net_monthly_profit DECIMAL(10, 2) NOT NULL,
      roi_percentage DECIMAL(5, 2) NOT NULL,
      total_earned_lifetime DECIMAL(12, 2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'maintenance', 'inactive', 'completed')),
      installation_date TIMESTAMP,
      next_maintenance_date TIMESTAMP,
      razorpay_payment_id VARCHAR(255),
      razorpay_order_id VARCHAR(255),
      host_location_city VARCHAR(100),
      host_location_state VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_investments_buyer_id ON investments(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_investments_host_id ON investments(host_id);
    CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);
  `);

  // Industries Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS industries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name VARCHAR(255) NOT NULL,
      industry_type VARCHAR(100) NOT NULL,
      daily_energy_demand_kwh DECIMAL(10, 2) NOT NULL,
      monthly_budget DECIMAL(12, 2),
      max_price_per_kwh DECIMAL(6, 2) NOT NULL,
      operational_hours_per_day INTEGER DEFAULT 24,
      peak_demand_hours VARCHAR(50) DEFAULT 'all-day',
      address TEXT NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      pincode VARCHAR(10) NOT NULL,
      contact_person VARCHAR(255) NOT NULL,
      contact_phone VARCHAR(15) NOT NULL,
      contact_email VARCHAR(255) NOT NULL,
      has_grid_backup BOOLEAN DEFAULT true,
      requires_24x7_supply BOOLEAN DEFAULT false,
      willing_to_sign_long_term_contract BOOLEAN DEFAULT false,
      contract_duration_preference_months INTEGER DEFAULT 12,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_industries_user_id ON industries(user_id);
    CREATE INDEX IF NOT EXISTS idx_industries_location ON industries(city, state);
    CREATE INDEX IF NOT EXISTS idx_industries_status ON industries(status);
  `);

  // Industry Contracts Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_contracts (
      id SERIAL PRIMARY KEY,
      investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
      industry_id INTEGER NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
      price_per_kwh DECIMAL(6, 2) NOT NULL,
      contract_start_date TIMESTAMP NOT NULL,
      contract_end_date TIMESTAMP NOT NULL,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(investment_id, industry_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_industry_contracts_investment ON industry_contracts(investment_id);
    CREATE INDEX IF NOT EXISTS idx_industry_contracts_industry ON industry_contracts(industry_id);
    CREATE INDEX IF NOT EXISTS idx_industry_contracts_status ON industry_contracts(status);
  `);

  // Industry Consumption Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_consumption (
      id SERIAL PRIMARY KEY,
      industry_id INTEGER NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
      investment_id INTEGER REFERENCES investments(id) ON DELETE SET NULL,
      energy_consumed_kwh DECIMAL(10, 2) NOT NULL,
      amount_paid DECIMAL(12, 2) NOT NULL,
      price_per_kwh DECIMAL(6, 2) NOT NULL,
      carbon_offset_kg DECIMAL(10, 2) DEFAULT 0,
      consumption_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_industry_consumption_industry ON industry_consumption(industry_id);
    CREATE INDEX IF NOT EXISTS idx_industry_consumption_date ON industry_consumption(consumption_date);
  `);

  // Pending Investments Table (for Razorpay order tracking)
  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_investments (
      id SERIAL PRIMARY KEY,
      razorpay_order_id VARCHAR(255) NOT NULL UNIQUE,
      razorpay_payment_id VARCHAR(255),
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_space_id INTEGER NOT NULL REFERENCES host_spaces(id) ON DELETE CASCADE,
      industry_id INTEGER NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
      amount DECIMAL(12, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_pending_investments_order ON pending_investments(razorpay_order_id);
    CREATE INDEX IF NOT EXISTS idx_pending_investments_buyer ON pending_investments(buyer_id);
  `);

  // Create uploads directories
  const fs = require('fs');
  const uploadsDir = './uploads';
  const propertiesDir = './uploads/properties';
  const certificatesDir = './uploads/certificates';

  [uploadsDir, propertiesDir, certificatesDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });

  console.log('✅ Investment system tables created successfully');
}

async function down(db) {
  console.log('Rolling back migration: Investment system tables...');

  await db.query('DROP TABLE IF EXISTS industry_consumption CASCADE');
  await db.query('DROP TABLE IF EXISTS industry_contracts CASCADE');
  await db.query('DROP TABLE IF EXISTS pending_investments CASCADE');
  await db.query('DROP TABLE IF EXISTS industries CASCADE');
  await db.query('DROP TABLE IF NOT EXISTS investments CASCADE');
  await db.query('DROP TABLE IF EXISTS host_spaces CASCADE');

  console.log('✅ Investment system tables rolled back');
}

module.exports = { up, down };
