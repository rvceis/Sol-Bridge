-- Create devices table if it doesn't exist
CREATE TABLE IF NOT EXISTS devices (
  device_id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  capacity_kwh DECIMAL(10, 2),
  efficiency_rating DECIMAL(5, 2),
  installation_date DATE,
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
