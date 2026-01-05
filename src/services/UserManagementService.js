const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { hashPassword, comparePasswords, generateTokenPair } = require('../utils/auth');
const { ValidationError, ConflictError, NotFoundError, AuthenticationError } = require('../utils/errors');
const { cacheSet, cacheGet, cacheDel } = require('../utils/cache');
const crypto = require('crypto');

class UserManagementService {
  // User Registration
  async register(userData) {
    const { email, password, role, full_name, phone, profile } = userData;

    // Check if email already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Start transaction
    try {
      const result = await db.transaction(async (client) => {
        // Create user record
        const userId = uuidv4();
        const userResult = await client.query(
          `INSERT INTO users (id, email, password_hash, role, full_name, phone, is_verified)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE)
           RETURNING id, email, role`,
          [userId, email.toLowerCase(), passwordHash, role, full_name, phone]
        );

        // Create wallet
        await client.query(
          'INSERT INTO wallets (user_id, balance) VALUES ($1, 0)',
          [userId]
        );

        // Create role-specific record
        if (role === 'host') {
          await client.query(
            `INSERT INTO hosts (user_id, solar_capacity_kw, has_battery, latitude, longitude, address, city, state, pincode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              userId,
              profile.solar_capacity_kw || 0,
              profile.has_battery || false,
              profile.location?.lat || 0,
              profile.location?.lon || 0,
              profile.address,
              profile.city,
              profile.state,
              profile.pincode,
            ]
          );
        } else if (role === 'buyer') {
          await client.query(
            `INSERT INTO buyers (user_id, household_size, has_ac, has_ev, latitude, longitude, address, city, state, pincode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              userId,
              profile.household_size || 1,
              profile.has_ac || false,
              profile.has_ev || false,
              profile.location?.lat || 0,
              profile.location?.lon || 0,
              profile.address,
              profile.city,
              profile.state,
              profile.pincode,
            ]
          );
        } else if (role === 'investor') {
          await client.query(
            `INSERT INTO investors (user_id, total_capital, available_capital, risk_appetite, min_roi_target)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              userId,
              profile.total_capital,
              profile.total_capital,
              profile.risk_appetite || 'medium',
              profile.min_roi_target || 12,
            ]
          );
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await client.query(
          `INSERT INTO verification_tokens (user_id, token, token_type, expires_at)
           VALUES ($1, $2, 'email_verification', $3)`,
          [userId, verificationToken, expiresAt]
        );

        return {
          userId,
          email: userResult.rows[0].email,
          verificationToken,
        };
      });

      // TODO: Send verification email with result.verificationToken

      return {
        user_id: result.userId,
        email: result.email,
        message: 'Registration successful. Please check email for verification link.',
      };
    } catch (error) {
      throw error;
    }
  }

  // User Login
  async login(email, password) {
    email = email.toLowerCase();

    // Fetch user
    const userResult = await db.query(
      'SELECT id, email, password_hash, role, is_verified, is_active, failed_login_attempts, locked_until FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      throw new AuthenticationError('Invalid credentials');
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AuthenticationError('Account locked. Try again later.');
    }

    // Verify password
    const isPasswordValid = await comparePasswords(password, user.password_hash);
    if (!isPasswordValid) {
      // Increment failed attempts
      await db.query(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1',
        [user.id]
      );

      // Lock account after 5 failed attempts
      if (user.failed_login_attempts >= 4) {
        const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        await db.query(
          'UPDATE users SET locked_until = $1 WHERE id = $2',
          [lockedUntil, user.id]
        );
      }

      throw new AuthenticationError('Invalid credentials');
    }

    // Check if email verified
    if (!user.is_verified) {
      throw new ValidationError('Please verify your email before logging in');
    }

    // Check if account is active
    if (!user.is_active) {
      throw new AuthenticationError('Account has been deactivated');
    }

    // Update last login and reset failed attempts
    await db.query(
      'UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const tokens = generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Get user profile
    const profile = await this.getProfile(user.id, user.role);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 86400, // 24 hours in seconds
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        ...profile,
      },
    };
  }

  // Verify Email
  async verifyEmail(token) {
    const tokenResult = await db.query(
      `SELECT user_id, is_used, expires_at FROM verification_tokens
       WHERE token = $1 AND token_type = 'email_verification'`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      throw new NotFoundError('Verification token not found');
    }

    const tokenRecord = tokenResult.rows[0];

    if (tokenRecord.is_used) {
      throw new ValidationError('Token has already been used');
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      throw new ValidationError('Token has expired');
    }

    // Update user and token
    await db.transaction(async (client) => {
      await client.query(
        'UPDATE users SET is_verified = TRUE WHERE id = $1',
        [tokenRecord.user_id]
      );

      await client.query(
        'UPDATE verification_tokens SET is_used = TRUE WHERE token = $1',
        [token]
      );
    });

    return { message: 'Email verified successfully' };
  }

  // Get User Profile
  async getProfile(userId, role = null) {
    // Get user
    const userResult = await db.query(
      'SELECT id, email, full_name, phone, role, is_verified, kyc_status, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = userResult.rows[0];
    role = role || user.role;

    // Get wallet balance
    const walletResult = await db.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId]
    );

    // Get role-specific profile
    let roleProfile = {};

    if (role === 'host') {
      const hostResult = await db.query(
        `SELECT solar_capacity_kw, panel_brand, installation_date, has_battery, battery_capacity_kwh,
                address, city, state, pincode, meter_id
         FROM hosts WHERE user_id = $1`,
        [userId]
      );
      roleProfile = hostResult.rows[0] || {};
    } else if (role === 'buyer') {
      const buyerResult = await db.query(
        `SELECT monthly_avg_consumption, household_size, has_ac, has_ev,
                address, city, state, pincode, meter_id, preferences
         FROM buyers WHERE user_id = $1`,
        [userId]
      );
      roleProfile = buyerResult.rows[0] || {};
    } else if (role === 'investor') {
      const investorResult = await db.query(
        `SELECT total_capital, available_capital, invested_capital, risk_appetite, min_roi_target
         FROM investors WHERE user_id = $1`,
        [userId]
      );
      roleProfile = investorResult.rows[0] || {};
    }

    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      is_verified: user.is_verified,
      kyc_status: user.kyc_status,
      wallet_balance: walletResult.rows[0]?.balance || 0,
      created_at: user.created_at,
      profile: roleProfile,
    };
  }

  // Update Profile
  async updateProfile(userId, updateData) {
    const { full_name, phone, profile } = updateData;

    try {
      return await db.transaction(async (client) => {
        // Update user fields
        const updates = [];
        const values = [userId];
        let paramCount = 2;

        if (full_name) {
          updates.push(`full_name = $${paramCount}`);
          values.push(full_name);
          paramCount++;
        }

        if (phone) {
          updates.push(`phone = $${paramCount}`);
          values.push(phone);
          paramCount++;
        }

        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          await client.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $1`,
            values
          );
        }

        // Update role-specific profile
        if (profile) {
          const userResult = await client.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
          );
          const role = userResult.rows[0].role;

          if (role === 'host' && Object.keys(profile).length > 0) {
            const hostUpdates = [];
            const hostValues = [userId];
            let hostParamCount = 2;

            Object.entries(profile).forEach(([key, value]) => {
              if (key === 'location' && value) {
                // Use separate lat/lon columns instead of PostGIS POINT
                hostUpdates.push(`latitude = $${hostParamCount}`);
                hostValues.push(value.lat || 0);
                hostParamCount++;
                hostUpdates.push(`longitude = $${hostParamCount}`);
                hostValues.push(value.lon || 0);
              } else {
                hostUpdates.push(`${key} = $${hostParamCount}`);
                hostValues.push(value);
              }
              hostParamCount++;
            });

            if (hostUpdates.length > 0) {
              hostUpdates.push(`updated_at = NOW()`);
              await client.query(
                `UPDATE hosts SET ${hostUpdates.join(', ')} WHERE user_id = $1`,
                hostValues
              );
            }
          }
          // Similar for buyer and investor...
        }

        // Clear cache
        await cacheDel(`user:profile:${userId}`);

        return this.getProfile(userId);
      });
    } catch (error) {
      throw error;
    }
  }

  // Password Reset
  async requestPasswordReset(email) {
    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists (security)
      return { message: 'If email exists, password reset link sent' };
    }

    const userId = userResult.rows[0].id;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query(
      `INSERT INTO verification_tokens (user_id, token, token_type, expires_at)
       VALUES ($1, $2, 'password_reset', $3)`,
      [userId, resetToken, expiresAt]
    );

    // TODO: Send password reset email with resetToken

    return { message: 'If email exists, password reset link sent' };
  }

  // Reset Password
  async resetPassword(token, newPassword) {
    const tokenResult = await db.query(
      `SELECT user_id, is_used, expires_at FROM verification_tokens
       WHERE token = $1 AND token_type = 'password_reset'`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      throw new NotFoundError('Reset token not found');
    }

    const tokenRecord = tokenResult.rows[0];

    if (tokenRecord.is_used) {
      throw new ValidationError('Token has already been used');
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      throw new ValidationError('Token has expired');
    }

    const passwordHash = await hashPassword(newPassword);

    await db.transaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, tokenRecord.user_id]
      );

      await client.query(
        'UPDATE verification_tokens SET is_used = TRUE WHERE token = $1',
        [token]
      );
    });

    return { message: 'Password reset successful' };
  }

  // Refresh Token
  async refreshAccessToken(refreshToken) {
    const payload = verifyRefreshToken(refreshToken);
    const tokens = generateTokenPair({
      id: payload.id,
      email: payload.email,
      role: payload.role,
    });

    return {
      accessToken: tokens.accessToken,
      expiresIn: 86400,
    };
  }
}

module.exports = new UserManagementService();
