const db = require('../database');
const logger = require('../utils/logger');

class ProfileService {
  // Get user profile with all details
  async getUserProfile(userId) {
    try {
      const result = await db.query(`
        SELECT 
          u.id, u.email, u.full_name, u.phone, u.role, u.kyc_status,
          u.is_verified, u.is_active, u.created_at
        FROM users u
        WHERE u.id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  // Update user profile
  async updateUserProfile(userId, updates) {
    try {
      const allowedFields = ['full_name', 'phone'];
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No valid fields to update');
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId);

      const query = `
        UPDATE users 
        SET ${fields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, email, full_name, phone, role, updated_at
      `;

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  // Get user addresses
  async getUserAddresses(userId) {
    try {
      const result = await db.query(`
        SELECT *
        FROM user_addresses
        WHERE user_id = $1
        ORDER BY is_default DESC, created_at DESC
      `, [userId]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting user addresses:', error);
      throw error;
    }
  }

  // Add user address
  async addUserAddress(userId, addressData) {
    try {
      const {
        address_type = 'home',
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country = 'India',
        latitude,
        longitude,
        is_default = false
      } = addressData;

      // If this is set as default, unset other defaults
      if (is_default) {
        await db.query(`
          UPDATE user_addresses
          SET is_default = FALSE
          WHERE user_id = $1
        `, [userId]);
      }

      const result = await db.query(`
        INSERT INTO user_addresses (
          user_id, address_type, address_line1, address_line2,
          city, state, postal_code, country, latitude, longitude, is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [userId, address_type, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_default]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error adding user address:', error);
      throw error;
    }
  }

  // Update user address
  async updateUserAddress(userId, addressId, updates) {
    try {
      // If setting as default, unset other defaults
      if (updates.is_default) {
        await db.query(`
          UPDATE user_addresses
          SET is_default = FALSE
          WHERE user_id = $1
        `, [userId]);
      }

      const allowedFields = ['address_type', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'latitude', 'longitude', 'is_default'];
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No valid fields to update');
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId, addressId);

      const query = `
        UPDATE user_addresses
        SET ${fields.join(', ')}
        WHERE user_id = $${paramCount} AND id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await db.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Address not found or unauthorized');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user address:', error);
      throw error;
    }
  }

  // Delete user address
  async deleteUserAddress(userId, addressId) {
    try {
      const result = await db.query(`
        DELETE FROM user_addresses
        WHERE user_id = $1 AND id = $2
        RETURNING id
      `, [userId, addressId]);

      if (result.rows.length === 0) {
        throw new Error('Address not found or unauthorized');
      }

      return { success: true, id: addressId };
    } catch (error) {
      logger.error('Error deleting user address:', error);
      throw error;
    }
  }

  // Get payment methods
  async getPaymentMethods(userId) {
    try {
      const result = await db.query(`
        SELECT 
          id, user_id, method_type, card_last4, card_brand,
          card_exp_month, card_exp_year, upi_id, bank_name,
          account_number_last4, ifsc_code, wallet_provider,
          is_default, is_verified, created_at
        FROM payment_methods
        WHERE user_id = $1
        ORDER BY is_default DESC, created_at DESC
      `, [userId]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting payment methods:', error);
      throw error;
    }
  }

  // Add payment method
  async addPaymentMethod(userId, paymentData) {
    try {
      const {
        method_type,
        card_last4,
        card_brand,
        card_exp_month,
        card_exp_year,
        upi_id,
        bank_name,
        account_number_last4,
        ifsc_code,
        wallet_provider,
        is_default = false,
        is_verified = false
      } = paymentData;

      // If this is set as default, unset other defaults
      if (is_default) {
        await db.query(`
          UPDATE payment_methods
          SET is_default = FALSE
          WHERE user_id = $1
        `, [userId]);
      }

      const result = await db.query(`
        INSERT INTO payment_methods (
          user_id, method_type, card_last4, card_brand, card_exp_month, card_exp_year,
          upi_id, bank_name, account_number_last4, ifsc_code, wallet_provider,
          is_default, is_verified
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [userId, method_type, card_last4, card_brand, card_exp_month, card_exp_year, upi_id, bank_name, account_number_last4, ifsc_code, wallet_provider, is_default, is_verified]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error adding payment method:', error);
      throw error;
    }
  }

  // Delete payment method
  async deletePaymentMethod(userId, paymentMethodId) {
    try {
      const result = await db.query(`
        DELETE FROM payment_methods
        WHERE user_id = $1 AND id = $2
        RETURNING id
      `, [userId, paymentMethodId]);

      if (result.rows.length === 0) {
        throw new Error('Payment method not found or unauthorized');
      }

      return { success: true, id: paymentMethodId };
    } catch (error) {
      logger.error('Error deleting payment method:', error);
      throw error;
    }
  }

  // Get user documents
  async getUserDocuments(userId) {
    try {
      const result = await db.query(`
        SELECT 
          id, document_type, document_name, file_size, mime_type,
          verification_status, rejection_reason, verified_at, created_at
        FROM user_documents
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [userId]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting user documents:', error);
      throw error;
    }
  }

  // Add user document
  async addUserDocument(userId, documentData) {
    try {
      const {
        document_type,
        document_name,
        file_path,
        file_size,
        mime_type
      } = documentData;

      const result = await db.query(`
        INSERT INTO user_documents (
          user_id, document_type, document_name, file_path, file_size, mime_type
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, document_type, document_name, file_size, verification_status, created_at
      `, [userId, document_type, document_name, file_path, file_size, mime_type]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error adding user document:', error);
      throw error;
    }
  }

  // Delete user document
  async deleteUserDocument(userId, documentId) {
    try {
      const result = await db.query(`
        DELETE FROM user_documents
        WHERE user_id = $1 AND id = $2
        RETURNING id, file_path
      `, [userId, documentId]);

      if (result.rows.length === 0) {
        throw new Error('Document not found or unauthorized');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting user document:', error);
      throw error;
    }
  }

  // Get user preferences
  async getUserPreferences(userId) {
    try {
      let result = await db.query(`
        SELECT *
        FROM user_preferences
        WHERE user_id = $1
      `, [userId]);

      // If no preferences exist, create default ones
      if (result.rows.length === 0) {
        result = await db.query(`
          INSERT INTO user_preferences (user_id)
          VALUES ($1)
          RETURNING *
        `, [userId]);
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  // Update user preferences
  async updateUserPreferences(userId, updates) {
    try {
      const allowedFields = [
        'notifications_push', 'notifications_email', 'notifications_sms', 'notifications_marketing',
        'security_two_factor', 'security_biometric',
        'theme', 'language', 'currency', 'timezone',
        'auto_update', 'analytics_enabled'
      ];

      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No valid fields to update');
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId);

      const query = `
        INSERT INTO user_preferences (user_id)
        VALUES ($${paramCount})
        ON CONFLICT (user_id) DO UPDATE
        SET ${fields.join(', ')}
        RETURNING *
      `;

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }
}

module.exports = new ProfileService();
