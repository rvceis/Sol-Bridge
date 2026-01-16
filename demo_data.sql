-- Demo Data for Solar Energy Marketplace
-- This file creates sample users, devices, and energy listings for demonstration

-- Insert demo users (sellers)
INSERT INTO users (email, password_hash, full_name, phone, role, kyc_status, profile_completed, created_at)
VALUES 
  ('seller1@demo.com', '$2b$10$demopasswordhash1', 'Rajesh Kumar', '+919876543210', 'seller', 'approved', true, NOW()),
  ('seller2@demo.com', '$2b$10$demopasswordhash2', 'Priya Sharma', '+919876543211', 'seller', 'approved', true, NOW()),
  ('seller3@demo.com', '$2b$10$demopasswordhash3', 'Amit Patel', '+919876543212', 'seller', 'approved', true, NOW()),
  ('seller4@demo.com', '$2b$10$demopasswordhash4', 'Sunita Singh', '+919876543213', 'seller', 'approved', true, NOW()),
  ('seller5@demo.com', '$2b$10$demopasswordhash5', 'Vijay Mehta', '+919876543214', 'seller', 'approved', true, NOW())
ON CONFLICT (email) DO NOTHING;

-- Get user IDs
DO $$
DECLARE
  user1_id INTEGER;
  user2_id INTEGER;
  user3_id INTEGER;
  user4_id INTEGER;
  user5_id INTEGER;
BEGIN
  SELECT id INTO user1_id FROM users WHERE email = 'seller1@demo.com';
  SELECT id INTO user2_id FROM users WHERE email = 'seller2@demo.com';
  SELECT id INTO user3_id FROM users WHERE email = 'seller3@demo.com';
  SELECT id INTO user4_id FROM users WHERE email = 'seller4@demo.com';
  SELECT id INTO user5_id FROM users WHERE email = 'seller5@demo.com';

  -- Insert addresses for demo users (locations around Delhi, India)
  INSERT INTO user_addresses (user_id, address_line1, city, state, postal_code, country, latitude, longitude, is_default, address_type)
  VALUES 
    (user1_id, 'Sector 15', 'Noida', 'Uttar Pradesh', '201301', 'India', 28.5920, 77.3380, true, 'residential'),
    (user2_id, 'Cyber City', 'Gurgaon', 'Haryana', '122002', 'India', 28.4955, 77.0865, true, 'residential'),
    (user3_id, 'Connaught Place', 'New Delhi', 'Delhi', '110001', 'India', 28.6304, 77.2177, true, 'commercial'),
    (user4_id, 'Dwarka Sector 10', 'New Delhi', 'Delhi', '110075', 'India', 28.5921, 77.0460, true, 'residential'),
    (user5_id, 'Greater Kailash', 'New Delhi', 'Delhi', '110048', 'India', 28.5494, 77.2426, true, 'residential')
  ON CONFLICT DO NOTHING;

  -- Create wallets for demo users
  INSERT INTO wallets (user_id, balance, created_at, updated_at)
  VALUES 
    (user1_id, 500.00, NOW(), NOW()),
    (user2_id, 750.00, NOW(), NOW()),
    (user3_id, 1000.00, NOW(), NOW()),
    (user4_id, 300.00, NOW(), NOW()),
    (user5_id, 600.00, NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert demo devices
  INSERT INTO devices (user_id, device_name, device_type, capacity_kwh, efficiency_rating, status, created_at)
  VALUES 
    (user1_id, 'Rooftop Solar Panel 5kW', 'Solar Panel', 5.0, 85.5, 'active', NOW()),
    (user2_id, 'Solar Panel Array 10kW', 'Solar Panel', 10.0, 88.0, 'active', NOW()),
    (user3_id, 'Commercial Solar System', 'Solar Panel', 25.0, 90.0, 'active', NOW()),
    (user4_id, 'Residential Solar 3kW', 'Solar Panel', 3.0, 82.0, 'active', NOW()),
    (user5_id, 'Solar Power Generator', 'Solar Panel', 7.5, 87.0, 'active', NOW())
  ON CONFLICT DO NOTHING;

END $$;

-- Insert demo energy listings
DO $$
DECLARE
  user1_id INTEGER;
  user2_id INTEGER;
  user3_id INTEGER;
  user4_id INTEGER;
  user5_id INTEGER;
  device1_id UUID;
  device2_id UUID;
  device3_id UUID;
  device4_id UUID;
  device5_id UUID;
BEGIN
  SELECT id INTO user1_id FROM users WHERE email = 'seller1@demo.com';
  SELECT id INTO user2_id FROM users WHERE email = 'seller2@demo.com';
  SELECT id INTO user3_id FROM users WHERE email = 'seller3@demo.com';
  SELECT id INTO user4_id FROM users WHERE email = 'seller4@demo.com';
  SELECT id INTO user5_id FROM users WHERE email = 'seller5@demo.com';

  SELECT device_id INTO device1_id FROM devices WHERE user_id = user1_id LIMIT 1;
  SELECT device_id INTO device2_id FROM devices WHERE user_id = user2_id LIMIT 1;
  SELECT device_id INTO device3_id FROM devices WHERE user_id = user3_id LIMIT 1;
  SELECT device_id INTO device4_id FROM devices WHERE user_id = user4_id LIMIT 1;
  SELECT device_id INTO device5_id FROM devices WHERE user_id = user5_id LIMIT 1;

  -- Insert listings with varied prices and energy amounts
  INSERT INTO energy_listings (
    seller_id, device_id, energy_amount_kwh, price_per_kwh, 
    available_from, available_to, listing_type, min_purchase_kwh,
    location_latitude, location_longitude, renewable_cert, description, status
  )
  VALUES 
    -- Noida - Low price, small quantity
    (user1_id, device1_id, 15.5, 4.50, NOW(), NOW() + INTERVAL '7 days', 'spot', 1.0,
     28.5920, 77.3380, true, 'Clean solar energy from rooftop panels. Great for small homes!', 'active'),
    
    -- Gurgaon - Medium price, medium quantity
    (user2_id, device2_id, 45.0, 5.20, NOW(), NOW() + INTERVAL '10 days', 'spot', 2.0,
     28.4955, 77.0865, true, 'Reliable solar power from certified panels. Bulk discounts available.', 'active'),
    
    -- Connaught Place - Premium price, large quantity
    (user3_id, device3_id, 100.0, 6.80, NOW(), NOW() + INTERVAL '14 days', 'spot', 5.0,
     28.6304, 77.2177, true, 'Premium commercial-grade solar energy. Perfect for businesses.', 'active'),
    
    -- Dwarka - Budget price, small quantity
    (user4_id, device4_id, 12.0, 4.00, NOW(), NOW() + INTERVAL '5 days', 'spot', 0.5,
     28.5921, 77.0460, true, 'Affordable green energy for your daily needs. New seller!', 'active'),
    
    -- Greater Kailash - Good price, good quantity
    (user5_id, device5_id, 30.0, 5.50, NOW(), NOW() + INTERVAL '12 days', 'spot', 1.5,
     28.5494, 77.2426, true, 'High-efficiency solar panels. Consistent power output guaranteed.', 'active'),
    
    -- Additional listings for variety
    (user1_id, device1_id, 20.0, 4.80, NOW() + INTERVAL '2 days', NOW() + INTERVAL '9 days', 'scheduled', 2.0,
     28.5920, 77.3380, true, 'Scheduled delivery for next week. Book in advance!', 'active'),
    
    (user2_id, device2_id, 50.0, 4.90, NOW(), NOW() + INTERVAL '30 days', 'subscription', 5.0,
     28.4955, 77.0865, true, 'Monthly subscription - steady supply of solar energy.', 'active'),
    
    (user3_id, device3_id, 75.0, 6.50, NOW(), NOW() + INTERVAL '7 days', 'spot', 10.0,
     28.6304, 77.2177, true, 'Bulk energy for industrial use. Contact for custom orders.', 'active'),
    
    (user5_id, device5_id, 25.0, 5.00, NOW() + INTERVAL '1 day', NOW() + INTERVAL '8 days', 'spot', 1.0,
     28.5494, 77.2426, true, 'Special weekend offer! Limited availability.', 'active'),
    
    (user4_id, device4_id, 10.0, 3.80, NOW(), NOW() + INTERVAL '4 days', 'spot', 0.5,
     28.5921, 77.0460, true, 'Budget-friendly solar power. First-time buyer discount available!', 'active');

END $$;

-- Update some users with ratings
UPDATE users SET rating_average = 4.5, rating_count = 12 WHERE email = 'seller1@demo.com';
UPDATE users SET rating_average = 4.8, rating_count = 25 WHERE email = 'seller2@demo.com';
UPDATE users SET rating_average = 4.9, rating_count = 45 WHERE email = 'seller3@demo.com';
UPDATE users SET rating_average = 4.2, rating_count = 5 WHERE email = 'seller4@demo.com';
UPDATE users SET rating_average = 4.7, rating_count = 18 WHERE email = 'seller5@demo.com';

-- Print success message
DO $$
BEGIN
  RAISE NOTICE 'Demo data created successfully!';
  RAISE NOTICE 'Created 5 demo sellers with devices and 10 energy listings';
  RAISE NOTICE 'Locations: Noida, Gurgaon, Delhi (Connaught Place, Dwarka, Greater Kailash)';
  RAISE NOTICE 'Price range: ₹3.80 - ₹6.80 per kWh';
  RAISE NOTICE 'Energy range: 10 - 100 kWh';
END $$;
