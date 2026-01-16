/**
 * Push Token Model
 * Store user device push tokens for notifications
 */

const db = require('../database');
const logger = require('../utils/logger');

class PushTokenModel {
  /**
   * Save or update user push token
   */
  static async saveToken(userId, token, deviceInfo = {}) {
    try {
      const { platform = 'unknown', deviceName = 'unknown' } = deviceInfo;
      
      const query = `
        INSERT INTO push_tokens (user_id, token, platform, device_name, last_used_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, token) 
        DO UPDATE SET 
          last_used_at = NOW(),
          is_active = true
        RETURNING *
      `;
      
      const result = await db.query(query, [userId, token, platform, deviceName]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error saving push token:', error);
      throw error;
    }
  }

  /**
   * Get all active tokens for user
   */
  static async getUserTokens(userId) {
    try {
      const query = `
        SELECT * FROM push_tokens 
        WHERE user_id = $1 AND is_active = true
        ORDER BY last_used_at DESC
      `;
      
      const result = await db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching user tokens:', error);
      throw error;
    }
  }

  /**
   * Deactivate token
   */
  static async deactivateToken(userId, token) {
    try {
      const query = `
        UPDATE push_tokens 
        SET is_active = false, updated_at = NOW()
        WHERE user_id = $1 AND token = $2
        RETURNING *
      `;
      
      const result = await db.query(query, [userId, token]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error deactivating token:', error);
      throw error;
    }
  }

  /**
   * Get tokens for multiple users (for bulk notifications)
   */
  static async getTokensForUsers(userIds) {
    try {
      const query = `
        SELECT user_id, token, platform, device_name
        FROM push_tokens 
        WHERE user_id = ANY($1) AND is_active = true
      `;
      
      const result = await db.query(query, [userIds]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching tokens for users:', error);
      throw error;
    }
  }

  /**
   * Clean up old inactive tokens (7 days)
   */
  static async cleanupOldTokens() {
    try {
      const query = `
        DELETE FROM push_tokens 
        WHERE is_active = false 
        AND updated_at < NOW() - INTERVAL '7 days'
      `;
      
      const result = await db.query(query);
      return result.rowCount;
    } catch (error) {
      logger.error('Error cleaning up tokens:', error);
      throw error;
    }
  }
}

module.exports = PushTokenModel;
