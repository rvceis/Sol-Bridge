const db = require('./index');
const logger = require('../utils/logger');

const createSchema = async () => {
  try {
    logger.info('Creating database schema...');

    // Enable extensions (skip postgis and timescaledb if not installed)
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    
    // Try postgis, but don't fail if not available (silently skip)
    try {
      await db.pool.query('CREATE EXTENSION IF NOT EXISTS "postgis"');
    } catch (e) {
      logger.info('PostGIS not installed - location features will use lat/lon');
    }
    
    // Try timescaledb, but don't fail if not available (silently skip)
    try {
      await db.pool.query('CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE');
    } catch (e) {
      logger.info('TimescaleDB not installed - using regular tables');
    }

    // ===== users table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('host', 'buyer', 'investor', 'admin')),
        full_name VARCHAR(255),
        phone VARCHAR(20),
        is_verified BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'submitted', 'verified', 'rejected')),
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)');

    // ===== hosts table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        solar_capacity_kw DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (solar_capacity_kw >= 0),
        panel_brand VARCHAR(100),
        panel_model VARCHAR(100),
        installation_date DATE,
        panel_efficiency DECIMAL(5, 4) CHECK (panel_efficiency BETWEEN 0.10 AND 0.30),
        has_battery BOOLEAN DEFAULT FALSE,
        battery_capacity_kwh DECIMAL(10, 2) CHECK (battery_capacity_kwh >= 0),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(10),
        meter_id VARCHAR(100) UNIQUE,
        inverter_brand VARCHAR(100),
        inverter_capacity_kw DECIMAL(10, 2),
        roof_type VARCHAR(50),
        roof_orientation VARCHAR(20),
        shading_factor DECIMAL(5, 2) CHECK (shading_factor BETWEEN 0 AND 100),
        pricing_preferences JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_hosts_lat_lon ON hosts(latitude, longitude)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_hosts_meter_id ON hosts(meter_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_hosts_user_id ON hosts(user_id)');

    // ===== buyers table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS buyers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        meter_id VARCHAR(100) UNIQUE,
        monthly_avg_consumption DECIMAL(10, 2),
        household_size INTEGER CHECK (household_size > 0),
        has_ac BOOLEAN DEFAULT FALSE,
        ac_tonnage DECIMAL(5, 2),
        has_ev BOOLEAN DEFAULT FALSE,
        ev_battery_kwh DECIMAL(10, 2),
        house_type VARCHAR(50),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(10),
        preferences JSONB DEFAULT '{"solar_percentage": 70, "max_price": 6.5}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_buyers_lat_lon ON buyers(latitude, longitude)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_buyers_meter_id ON buyers(meter_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_buyers_user_id ON buyers(user_id)');

    // ===== investors table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS investors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        total_capital DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (total_capital >= 0),
        available_capital DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (available_capital >= 0),
        invested_capital DECIMAL(12, 2) GENERATED ALWAYS AS (total_capital - available_capital) STORED,
        risk_appetite VARCHAR(20) CHECK (risk_appetite IN ('low', 'medium', 'high')),
        min_roi_target DECIMAL(5, 2),
        preferred_locations JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_investors_user_id ON investors(user_id)');

    // ===== investor_allocations table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS investor_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        investor_id UUID REFERENCES investors(id) ON DELETE CASCADE,
        host_id UUID REFERENCES hosts(id) ON DELETE CASCADE,
        investment_amount DECIMAL(12, 2) NOT NULL CHECK (investment_amount > 0),
        investment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        expected_roi DECIMAL(5, 2),
        contract_duration_months INTEGER CHECK (contract_duration_months > 0),
        start_date DATE NOT NULL,
        end_date DATE,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
        total_returns_paid DECIMAL(12, 2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        
        CONSTRAINT unique_investor_host UNIQUE (investor_id, host_id)
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_investor_alloc_investor ON investor_allocations(investor_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_investor_alloc_host ON investor_allocations(host_id)');

    // ===== allocations table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        allocation_date DATE NOT NULL,
        hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
        host_id UUID REFERENCES hosts(id),
        buyer_id UUID REFERENCES buyers(id),
        planned_energy_kwh DECIMAL(10, 4) CHECK (planned_energy_kwh >= 0),
        actual_energy_kwh DECIMAL(10, 4) CHECK (actual_energy_kwh >= 0),
        price_per_kwh DECIMAL(6, 2) NOT NULL CHECK (price_per_kwh > 0),
        total_amount DECIMAL(10, 2),
        status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'executed', 'partial', 'failed')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        
        CONSTRAINT unique_allocation_per_hour UNIQUE (allocation_date, hour, host_id, buyer_id)
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_allocations_date_hour ON allocations(allocation_date, hour)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_allocations_host ON allocations(host_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_allocations_buyer ON allocations(buyer_id)');

    // ===== transactions table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('energy_sale', 'wallet_topup', 'withdrawal', 'refund', 'fee')),
        user_id UUID REFERENCES users(id),
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        reference_id UUID,
        reference_type VARCHAR(50),
        balance_before DECIMAL(10, 2),
        balance_after DECIMAL(10, 2),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
        payment_method VARCHAR(50),
        payment_gateway_txn_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)');

    // ===== wallets table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(10, 2) DEFAULT 0 CHECK (balance >= 0),
        currency VARCHAR(3) DEFAULT 'INR',
        last_transaction_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ===== devices table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS devices (
        device_id VARCHAR(100) PRIMARY KEY,
        user_id UUID REFERENCES users(id),
        device_name VARCHAR(255) NOT NULL,
        device_type VARCHAR(50) NOT NULL,
        capacity_kwh DECIMAL(10, 2),
        efficiency_rating DECIMAL(5, 2),
        device_model VARCHAR(100),
        firmware_version VARCHAR(50),
        mqtt_username VARCHAR(255) UNIQUE,
        mqtt_password_hash VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive', 'faulty', 'decommissioned')),
        last_seen_at TIMESTAMPTZ,
        last_reading JSONB,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        installation_date DATE,
        metadata JSONB DEFAULT '{}',
        configuration JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL');

    // ===== energy_readings hypertable (TimescaleDB) =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS energy_readings (
        time TIMESTAMPTZ NOT NULL,
        device_id VARCHAR(100) NOT NULL,
        user_id UUID NOT NULL,
        measurement_type VARCHAR(50) NOT NULL,
        power_kw DECIMAL(10, 4),
        energy_kwh DECIMAL(12, 4),
        voltage DECIMAL(8, 2),
        current DECIMAL(8, 2),
        frequency DECIMAL(5, 2),
        power_factor DECIMAL(4, 3),
        battery_soc DECIMAL(5, 2),
        battery_voltage DECIMAL(8, 2),
        battery_current DECIMAL(8, 2),
        temperature DECIMAL(5, 2),
        metadata JSONB
      )
    `);

    // Convert to hypertable if not already (only if TimescaleDB is available)
    try {
      await db.pool.query(`
        SELECT create_hypertable('energy_readings', 'time', chunk_time_interval => INTERVAL '1 week', if_not_exists => TRUE)
      `);
    } catch (err) {
      // Silently skip if TimescaleDB is not available
    }

    // Create indexes on energy_readings
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_device_time ON energy_readings (device_id, time DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_user_time ON energy_readings (user_id, time DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_type ON energy_readings (measurement_type)');

    // ===== verification_tokens table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        token_type VARCHAR(50) DEFAULT 'email_verification' CHECK (token_type IN ('email_verification', 'password_reset', 'phone_verification')),
        expires_at TIMESTAMPTZ NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_verification_tokens_user ON verification_tokens(user_id)');

    // ===== daily_statements table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS daily_statements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        statement_date DATE NOT NULL,
        total_cost_or_earnings DECIMAL(10, 2),
        total_energy_kwh DECIMAL(10, 4),
        wallet_balance_before DECIMAL(10, 2),
        wallet_balance_after DECIMAL(10, 2),
        statement_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_daily_statements_user_date ON daily_statements(user_id, statement_date)');

    // ===== user_addresses table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        address_type VARCHAR(20) DEFAULT 'home' CHECK (address_type IN ('home', 'work', 'billing', 'other')),
        address_line1 TEXT NOT NULL,
        address_line2 TEXT,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20) NOT NULL,
        country VARCHAR(100) DEFAULT 'India',
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_addresses_location ON user_addresses(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL');
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id) WHERE is_default = true');

    // ===== payment_methods table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        method_type VARCHAR(20) NOT NULL CHECK (method_type IN ('card', 'upi', 'bank_transfer', 'wallet')),
        card_last4 VARCHAR(4),
        card_brand VARCHAR(20),
        card_exp_month INTEGER CHECK (card_exp_month BETWEEN 1 AND 12),
        card_exp_year INTEGER,
        upi_id VARCHAR(100),
        bank_name VARCHAR(100),
        account_number_last4 VARCHAR(4),
        ifsc_code VARCHAR(20),
        wallet_provider VARCHAR(50),
        is_default BOOLEAN DEFAULT FALSE,
        is_verified BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id)');

    // ===== user_documents table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('identity', 'address_proof', 'bank_statement', 'pan_card', 'aadhaar', 'other')),
        document_name VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        mime_type VARCHAR(100),
        verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
        rejection_reason TEXT,
        verified_at TIMESTAMPTZ,
        verified_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_documents_type ON user_documents(document_type)');

    // ===== user_preferences table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        notifications_push BOOLEAN DEFAULT TRUE,
        notifications_email BOOLEAN DEFAULT TRUE,
        notifications_sms BOOLEAN DEFAULT FALSE,
        notifications_marketing BOOLEAN DEFAULT TRUE,
        security_two_factor BOOLEAN DEFAULT FALSE,
        security_biometric BOOLEAN DEFAULT FALSE,
        theme VARCHAR(10) DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
        language VARCHAR(5) DEFAULT 'en',
        currency VARCHAR(3) DEFAULT 'INR',
        timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
        auto_update BOOLEAN DEFAULT TRUE,
        analytics_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id)');

    // ===== energy_listings table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS energy_listings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
        device_id VARCHAR(100),
        energy_amount_kwh DECIMAL(10, 4) NOT NULL CHECK (energy_amount_kwh > 0),
        price_per_kwh DECIMAL(10, 2) NOT NULL CHECK (price_per_kwh > 0),
        available_from TIMESTAMPTZ NOT NULL,
        available_to TIMESTAMPTZ NOT NULL,
        listing_type VARCHAR(20) DEFAULT 'spot' CHECK (listing_type IN ('spot', 'forward', 'subscription')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired', 'cancelled')),
        min_purchase_kwh DECIMAL(10, 4) DEFAULT 1.0,
        location_latitude DECIMAL(10, 8),
        location_longitude DECIMAL(11, 8),
        renewable_cert BOOLEAN DEFAULT TRUE,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        views_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT check_availability_dates CHECK (available_to > available_from)
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_listings_seller ON energy_listings(seller_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_listings_status ON energy_listings(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_listings_dates ON energy_listings(available_from, available_to)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_listings_price ON energy_listings(price_per_kwh)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_listings_location ON energy_listings(location_latitude, location_longitude) WHERE location_latitude IS NOT NULL AND location_longitude IS NOT NULL');

    // ===== energy_transactions table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS energy_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id UUID REFERENCES energy_listings(id),
        buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
        seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
        energy_amount_kwh DECIMAL(10, 4) NOT NULL CHECK (energy_amount_kwh > 0),
        price_per_kwh DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(12, 2) NOT NULL,
        platform_fee DECIMAL(10, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
        payment_method_id UUID REFERENCES payment_methods(id),
        payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
        payment_transaction_id VARCHAR(255),
        delivery_start TIMESTAMPTZ,
        delivery_end TIMESTAMPTZ,
        delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'in_progress', 'completed', 'failed')),
        energy_delivered_kwh DECIMAL(10, 4),
        rating INTEGER CHECK (rating BETWEEN 1 AND 5),
        review TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_transactions_buyer ON energy_transactions(buyer_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_transactions_seller ON energy_transactions(seller_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_transactions_listing ON energy_transactions(listing_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_transactions_status ON energy_transactions(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_energy_transactions_created ON energy_transactions(created_at DESC)');

    // ===== payments table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        currency VARCHAR(3) DEFAULT 'INR',
        payment_type VARCHAR(30) NOT NULL CHECK (payment_type IN ('wallet_topup', 'energy_purchase', 'refund', 'withdrawal')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
        gateway VARCHAR(20) CHECK (gateway IN ('razorpay', 'stripe', 'paytm', 'phonepe', 'wallet')),
        gateway_order_id VARCHAR(255),
        gateway_payment_id VARCHAR(255),
        reference_id UUID,
        reference_type VARCHAR(50),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_payments_gateway_order ON payments(gateway_order_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference_id, reference_type)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC)');

    // ===== solar_verifications table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS solar_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Status
        verification_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        
        -- Documents (file paths)
        electricity_bill_path TEXT,
        solar_invoice_path TEXT,
        installation_certificate_path TEXT,
        net_metering_agreement_path TEXT,
        subsidy_approval_path TEXT,
        property_proof_path TEXT,
        kyc_documents_path TEXT,
        
        -- Extracted Data (from OCR)
        consumer_number VARCHAR(100),
        panel_capacity_kw DECIMAL(10, 2),
        installer_name VARCHAR(255),
        installer_mnre_reg VARCHAR(100),
        net_metering_number VARCHAR(100),
        subsidy_id VARCHAR(100),
        installation_date DATE,
        
        -- Validation Results
        cross_document_check_passed BOOLEAN DEFAULT FALSE,
        format_validation_passed BOOLEAN DEFAULT FALSE,
        date_logic_check_passed BOOLEAN DEFAULT FALSE,
        installer_verified BOOLEAN DEFAULT FALSE,
        
        -- AI Analysis
        document_authenticity_score DECIMAL(5, 2),
        ai_flags JSONB DEFAULT '{}',
        
        -- Government Verification
        govt_api_verified BOOLEAN DEFAULT FALSE,
        govt_response JSONB DEFAULT '{}',
        
        -- Admin Review
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        admin_notes TEXT,
        
        -- Metadata
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_verifications_user ON solar_verifications(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_verifications_status ON solar_verifications(verification_status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_verifications_submitted ON solar_verifications(submitted_at DESC)');

    // Add verification fields to users table if not exists
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_verified_seller') THEN
          ALTER TABLE users ADD COLUMN is_verified_seller BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='verification_id') THEN
          ALTER TABLE users ADD COLUMN verification_id UUID REFERENCES solar_verifications(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='verified_at') THEN
          ALTER TABLE users ADD COLUMN verified_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);

    // ===== market_statistics table =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS market_statistics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stat_date DATE NOT NULL,
        total_listings INTEGER DEFAULT 0,
        active_listings INTEGER DEFAULT 0,
        total_transactions INTEGER DEFAULT 0,
        total_energy_traded_kwh DECIMAL(15, 4) DEFAULT 0,
        total_value DECIMAL(15, 2) DEFAULT 0,
        avg_price_per_kwh DECIMAL(10, 2),
        min_price_per_kwh DECIMAL(10, 2),
        max_price_per_kwh DECIMAL(10, 2),
        unique_buyers INTEGER DEFAULT 0,
        unique_sellers INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(stat_date)
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_market_statistics_date ON market_statistics(stat_date DESC)');

    // ===== panel_predictions table (for solar panel output forecasts) =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS panel_predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id VARCHAR(100) NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        predicted_date TIMESTAMP NOT NULL,
        predicted_value DECIMAL(10, 4) NOT NULL,
        actual_value DECIMAL(10, 4),
        confidence DECIMAL(5, 4) DEFAULT 0.75,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(device_id, predicted_date)
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_panel_predictions_device ON panel_predictions(device_id, predicted_date DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_panel_predictions_user ON panel_predictions(user_id, predicted_date DESC)');

    // ===== consumption_predictions table (for user consumption forecasts) =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS consumption_predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        predicted_date TIMESTAMP NOT NULL,
        predicted_value DECIMAL(10, 4) NOT NULL,
        actual_value DECIMAL(10, 4),
        hourly_breakdown JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, predicted_date)
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_consumption_predictions_user ON consumption_predictions(user_id, predicted_date DESC)');

    // ===== anomaly_alerts table (for system anomaly detection) =====
    await db.query(`
      CREATE TABLE IF NOT EXISTS anomaly_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id VARCHAR(100),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alert_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        description TEXT,
        detected_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        resolution_notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_user ON anomaly_alerts(user_id, detected_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_severity ON anomaly_alerts(severity, resolved_at)');

    logger.info('Database schema created successfully');
    return true;
  } catch (error) {
    logger.error('Error creating database schema:', error.message);
    logger.error('Stack trace:', error.stack);
    console.error('FULL ERROR:', error);
    throw error;
  }
};

module.exports = {
  createSchema,
};
