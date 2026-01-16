-- Phase 11: Push Notifications, Profile, Withdrawals

-- Push Tokens Table
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) DEFAULT 'unknown',
  device_name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_cleanup ON push_tokens(is_active, updated_at);

-- User Profile Extensions
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_approved_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejected_reason TEXT;

-- Bank Account Details
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_holder_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  ifsc_code VARCHAR(20) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  branch_name VARCHAR(255),
  account_type VARCHAR(20) DEFAULT 'savings',
  is_verified BOOLEAN DEFAULT false,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_primary ON bank_accounts(user_id) WHERE is_primary = true;

-- Withdrawal Requests
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  processed_by UUID REFERENCES users(id),
  transaction_id VARCHAR(100),
  notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_date ON withdrawal_requests(requested_at DESC);

-- Document Uploads (Enhanced)
ALTER TABLE document_uploads ADD COLUMN IF NOT EXISTS document_category VARCHAR(50);
ALTER TABLE document_uploads ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE document_uploads ADD COLUMN IF NOT EXISTS document_number VARCHAR(100);

-- User Ratings
CREATE TABLE IF NOT EXISTS user_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id UUID NOT NULL REFERENCES users(id),
  rated_user_id UUID NOT NULL REFERENCES users(id),
  transaction_id UUID REFERENCES energy_transactions(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(rater_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_rated_user ON user_ratings(rated_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_transaction ON user_ratings(transaction_id);

-- Update users table with rating fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_average DECIMAL(3, 2) DEFAULT 0.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  payment_received BOOLEAN DEFAULT true,
  listing_sold BOOLEAN DEFAULT true,
  new_listing_nearby BOOLEAN DEFAULT true,
  price_drop_alert BOOLEAN DEFAULT true,
  verification_updates BOOLEAN DEFAULT true,
  marketing_updates BOOLEAN DEFAULT false,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Admin Notes for KYC
CREATE TABLE IF NOT EXISTS kyc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL,
  notes TEXT,
  reviewed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_reviews_user ON kyc_reviews(user_id);

COMMENT ON TABLE push_tokens IS 'Store device push notification tokens';
COMMENT ON TABLE bank_accounts IS 'User bank account details for withdrawals';
COMMENT ON TABLE withdrawal_requests IS 'Wallet withdrawal requests';
COMMENT ON TABLE user_ratings IS 'User ratings and reviews';
COMMENT ON TABLE notification_preferences IS 'User notification settings';
COMMENT ON TABLE kyc_reviews IS 'Admin KYC review history';
