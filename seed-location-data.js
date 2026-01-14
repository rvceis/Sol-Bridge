/**
 * Seed script to populate database with realistic location-based test data
 * Run with: node seed-location-data.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'solar_sharing',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Bangalore area coordinates (12.9716° N, 77.5946° E)
const BANGALORE_CENTER = { lat: 12.9716, lon: 77.5946 };

// Generate random point within radius (in km)
function randomLocationNear(center, radiusKm) {
  const radiusDegrees = radiusKm / 111; // Approx conversion
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusDegrees;
  
  return {
    lat: center.lat + distance * Math.cos(angle),
    lon: center.lon + distance * Math.sin(angle)
  };
}

// Generate realistic neighborhoods
const NEIGHBORHOODS = [
  { name: 'Koramangala', lat: 12.9352, lon: 77.6245 },
  { name: 'Indiranagar', lat: 12.9784, lon: 77.6408 },
  { name: 'Whitefield', lat: 12.9698, lon: 77.7500 },
  { name: 'HSR Layout', lat: 12.9121, lon: 77.6446 },
  { name: 'Jayanagar', lat: 12.9250, lon: 77.5838 },
  { name: 'Marathahalli', lat: 12.9591, lon: 77.7017 },
  { name: 'BTM Layout', lat: 12.9165, lon: 77.6101 },
  { name: 'Electronic City', lat: 12.8456, lon: 77.6603 },
  { name: 'Malleshwaram', lat: 12.9899, lon: 77.5704 },
  { name: 'Yelahanka', lat: 13.1007, lon: 77.5963 },
];

async function seedData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('🌱 Starting data seed...\n');

    // Hash password once for all test users
    const passwordHash = await bcrypt.hash('Test@123456', 12);

    // Create test users with various roles
    const users = [];
    
    // Create 20 hosts (sellers)
    console.log('Creating 20 hosts (solar panel owners)...');
    for (let i = 0; i < 20; i++) {
      const neighborhood = NEIGHBORHOODS[i % NEIGHBORHOODS.length];
      const location = randomLocationNear(neighborhood, 2); // Within 2km of neighborhood
      const userId = uuidv4();
      
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, full_name, phone, is_verified, is_active)
        VALUES ($1, $2, $3, 'host', $4, $5, true, true)
      `, [
        userId,
        `host${i + 1}@solar.test`,
        passwordHash,
        `Solar Host ${i + 1}`,
        `+9198765${10000 + i}`
      ]);

      // Create host profile
      await client.query(`
        INSERT INTO hosts (
          user_id, solar_capacity_kw, has_battery, latitude, longitude,
          address, city, state, pincode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId,
        (3 + Math.random() * 7).toFixed(2), // 3-10 kW capacity
        Math.random() > 0.5,
        location.lat,
        location.lon,
        `${neighborhood.name} Area`,
        'Bangalore',
        'Karnataka',
        '560001'
      ]);

      // Create primary address
      await client.query(`
        INSERT INTO user_addresses (
          user_id, address_type, address_line1, city, state, postal_code,
          latitude, longitude, is_default
        ) VALUES ($1, 'home', $2, 'Bangalore', 'Karnataka', '560001', $3, $4, true)
      `, [userId, `${neighborhood.name} Area`, location.lat, location.lon]);

      // Create wallet
      await client.query(
        'INSERT INTO wallets (user_id, balance) VALUES ($1, $2)',
        [userId, (Math.random() * 10000).toFixed(2)]
      );

      users.push({ id: userId, role: 'host', location });
    }

    // Create 15 buyers
    console.log('Creating 15 buyers (energy consumers)...');
    for (let i = 0; i < 15; i++) {
      const neighborhood = NEIGHBORHOODS[i % NEIGHBORHOODS.length];
      const location = randomLocationNear(neighborhood, 3);
      const userId = uuidv4();
      
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, full_name, phone, is_verified, is_active)
        VALUES ($1, $2, $3, 'buyer', $4, $5, true, true)
      `, [
        userId,
        `buyer${i + 1}@solar.test`,
        passwordHash,
        `Energy Buyer ${i + 1}`,
        `+9198765${20000 + i}`
      ]);

      await client.query(`
        INSERT INTO buyers (
          user_id, household_size, has_ac, has_ev, latitude, longitude,
          address, city, state, pincode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        userId,
        Math.floor(1 + Math.random() * 5), // 1-5 household size
        Math.random() > 0.3, // 70% have AC
        Math.random() > 0.7, // 30% have EV
        location.lat,
        location.lon,
        `${neighborhood.name} Area`,
        'Bangalore',
        'Karnataka',
        '560001'
      ]);

      await client.query(`
        INSERT INTO user_addresses (
          user_id, address_type, address_line1, city, state, postal_code,
          latitude, longitude, is_default
        ) VALUES ($1, 'home', $2, 'Bangalore', 'Karnataka', '560001', $3, $4, true)
      `, [userId, `${neighborhood.name} Area`, location.lat, location.lon]);

      await client.query(
        'INSERT INTO wallets (user_id, balance) VALUES ($1, $2)',
        [userId, (Math.random() * 5000).toFixed(2)]
      );

      users.push({ id: userId, role: 'buyer', location });
    }

    // Create 5 investors
    console.log('Creating 5 investors...');
    for (let i = 0; i < 5; i++) {
      const neighborhood = NEIGHBORHOODS[i % NEIGHBORHOODS.length];
      const location = randomLocationNear(neighborhood, 5);
      const userId = uuidv4();
      
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, full_name, phone, is_verified, is_active)
        VALUES ($1, $2, $3, 'investor', $4, $5, true, true)
      `, [
        userId,
        `investor${i + 1}@solar.test`,
        passwordHash,
        `Solar Investor ${i + 1}`,
        `+9198765${30000 + i}`
      ]);

      const totalCapital = 100000 + Math.random() * 900000; // 1L-10L
      await client.query(`
        INSERT INTO investors (
          user_id, total_capital, available_capital, risk_appetite, min_roi_target
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        userId,
        totalCapital.toFixed(2),
        (totalCapital * 0.7).toFixed(2), // 70% available
        ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        10 + Math.random() * 10 // 10-20% ROI target
      ]);

      await client.query(`
        INSERT INTO user_addresses (
          user_id, address_type, address_line1, city, state, postal_code,
          latitude, longitude, is_default
        ) VALUES ($1, 'home', $2, 'Bangalore', 'Karnataka', '560001', $3, $4, true)
      `, [userId, `${neighborhood.name} Area`, location.lat, location.lon]);

      await client.query(
        'INSERT INTO wallets (user_id, balance) VALUES ($1, $2)',
        [userId, (Math.random() * 50000).toFixed(2)]
      );

      users.push({ id: userId, role: 'investor', location });
    }

    // Create devices for hosts
    console.log('Creating devices for hosts...');
    const hosts = users.filter(u => u.role === 'host');
    for (const host of hosts) {
      const deviceId = `DEV-${host.id.substring(0, 8)}`;
      await client.query(`
        INSERT INTO devices (
          device_id, user_id, device_type, device_model, status,
          latitude, longitude, installation_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        deviceId,
        host.id,
        'solar_meter',
        ['SolarEdge SE7600', 'Fronius Primo', 'SMA Sunny Boy'][Math.floor(Math.random() * 3)],
        'active',
        host.location.lat,
        host.location.lon,
        new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) // Random date in last year
      ]);
    }

    // Create active listings
    console.log('Creating 30 active energy listings...');
    for (let i = 0; i < 30; i++) {
      const host = hosts[Math.floor(Math.random() * hosts.length)];
      const location = randomLocationNear(host.location, 0.5); // Slight variation
      
      const available_from = new Date();
      const available_to = new Date(Date.now() + (1 + Math.random() * 6) * 24 * 60 * 60 * 1000); // 1-7 days

      await client.query(`
        INSERT INTO energy_listings (
          seller_id, energy_amount_kwh, price_per_kwh,
          available_from, available_to, listing_type, status,
          location_latitude, location_longitude, renewable_cert, description
        ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10)
      `, [
        host.id,
        (10 + Math.random() * 90).toFixed(2), // 10-100 kWh
        (3 + Math.random() * 3).toFixed(2), // ₹3-6 per kWh
        available_from,
        available_to,
        ['spot', 'forward'][Math.floor(Math.random() * 2)],
        location.lat,
        location.lon,
        true,
        'Clean solar energy from rooftop panels'
      ]);
    }

    // Create some completed transactions for rating history
    console.log('Creating transaction history...');
    const buyers = users.filter(u => u.role === 'buyer');
    for (let i = 0; i < 15; i++) {
      const host = hosts[Math.floor(Math.random() * hosts.length)];
      const buyer = buyers[Math.floor(Math.random() * buyers.length)];
      
      // Create a sold listing
      const listingResult = await client.query(`
        INSERT INTO energy_listings (
          seller_id, energy_amount_kwh, price_per_kwh,
          available_from, available_to, listing_type, status,
          location_latitude, location_longitude, renewable_cert
        ) VALUES ($1, $2, $3, NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days', 'spot', 'sold', $4, $5, true)
        RETURNING id
      `, [
        host.id,
        (20 + Math.random() * 30).toFixed(2),
        (3.5 + Math.random() * 2).toFixed(2),
        host.location.lat,
        host.location.lon
      ]);

      const listingId = listingResult.rows[0].id;
      const energyAmount = 15 + Math.random() * 20;
      const pricePerKwh = 4 + Math.random();
      const totalPrice = energyAmount * pricePerKwh;

      // Create completed transaction
      await client.query(`
        INSERT INTO energy_transactions (
          listing_id, buyer_id, seller_id, energy_amount_kwh,
          price_per_kwh, total_price, platform_fee, status,
          payment_status, delivery_status, rating, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', 'completed', 'completed', $8, NOW() - INTERVAL '3 days')
      `, [
        listingId,
        buyer.id,
        host.id,
        energyAmount.toFixed(2),
        pricePerKwh.toFixed(2),
        totalPrice.toFixed(2),
        (totalPrice * 0.05).toFixed(2), // 5% platform fee
        Math.floor(3 + Math.random() * 3) // Rating 3-5
      ]);
    }

    await client.query('COMMIT');
    
    console.log('\n✅ Seed data created successfully!');
    console.log('\n📊 Summary:');
    console.log(`  - 20 hosts with solar panels across Bangalore`);
    console.log(`  - 15 buyers looking for clean energy`);
    console.log(`  - 5 investors with capital`);
    console.log(`  - 20 active solar devices`);
    console.log(`  - 30 active energy listings`);
    console.log(`  - 15 completed transactions with ratings`);
    console.log('\n🔐 Test credentials:');
    console.log('  Email: host1@solar.test (or buyer1@solar.test, investor1@solar.test)');
    console.log('  Password: Test@123456');
    console.log('\n🗺️  All users are spread across Bangalore neighborhoods');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    client.release();
    pool.end();
  }
}

seedData();
