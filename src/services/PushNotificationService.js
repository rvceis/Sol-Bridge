/**
 * Push Notification Service
 * Send push notifications via Expo Push API
 */

const axios = require('axios');
const logger = require('../utils/logger');
const PushTokenModel = require('../models/PushToken');

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

class PushNotificationService {
  /**
   * Send notification to single user
   */
  static async sendToUser(userId, notification) {
    try {
      const tokens = await PushTokenModel.getUserTokens(userId);
      
      if (tokens.length === 0) {
        logger.warn(`No active push tokens for user ${userId}`);
        return { success: false, message: 'No active tokens' };
      }

      const messages = tokens.map(tokenData => ({
        to: tokenData.token,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        sound: notification.sound !== false ? 'default' : null,
        badge: notification.badge,
        priority: notification.priority || 'high',
      }));

      const response = await axios.post(EXPO_PUSH_API, messages);
      
      logger.info(`Sent notification to user ${userId}:`, {
        title: notification.title,
        recipients: tokens.length,
      });

      return { success: true, data: response.data };
    } catch (error) {
      logger.error('Error sending notification to user:', error);
      throw error;
    }
  }

  /**
   * Send notification to multiple users
   */
  static async sendToUsers(userIds, notification) {
    try {
      const tokens = await PushTokenModel.getTokensForUsers(userIds);
      
      if (tokens.length === 0) {
        logger.warn('No active push tokens for users');
        return { success: false, message: 'No active tokens' };
      }

      const messages = tokens.map(tokenData => ({
        to: tokenData.token,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        sound: notification.sound !== false ? 'default' : null,
        badge: notification.badge,
        priority: notification.priority || 'high',
      }));

      // Send in batches of 100 (Expo limit)
      const batches = [];
      for (let i = 0; i < messages.length; i += 100) {
        batches.push(messages.slice(i, i + 100));
      }

      const results = [];
      for (const batch of batches) {
        const response = await axios.post(EXPO_PUSH_API, batch);
        results.push(response.data);
      }

      logger.info(`Sent notification to ${userIds.length} users (${tokens.length} devices)`);

      return { success: true, data: results };
    } catch (error) {
      logger.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Send payment received notification (for sellers)
   */
  static async notifyPaymentReceived(sellerId, amount, buyerName) {
    return this.sendToUser(sellerId, {
      title: '💰 Payment Received!',
      body: `You received ₹${amount.toFixed(2)} from ${buyerName}`,
      data: { type: 'payment_received', amount },
      sound: true,
    });
  }

  /**
   * Send listing sold notification
   */
  static async notifyListingSold(sellerId, listingId, energyAmount, totalAmount) {
    return this.sendToUser(sellerId, {
      title: '⚡ Energy Sold!',
      body: `${energyAmount} kWh sold for ₹${totalAmount.toFixed(2)}`,
      data: { type: 'listing_sold', listingId, energyAmount, totalAmount },
      sound: true,
    });
  }

  /**
   * Send new listing nearby notification
   */
  static async notifyNewListingNearby(userIds, sellerName, pricePerKwh, distance) {
    return this.sendToUsers(userIds, {
      title: '🌟 New Energy Available Nearby!',
      body: `${sellerName} is selling at ₹${pricePerKwh}/kWh (${distance.toFixed(1)} km away)`,
      data: { type: 'new_listing_nearby' },
      sound: false,
      priority: 'normal',
    });
  }

  /**
   * Send verification approved notification
   */
  static async notifyVerificationApproved(userId) {
    return this.sendToUser(userId, {
      title: '🎉 Verification Approved!',
      body: 'Your documents have been verified. You can now sell energy!',
      data: { type: 'verification_approved' },
      sound: true,
    });
  }

  /**
   * Send low balance warning
   */
  static async notifyLowBalance(userId, balance) {
    return this.sendToUser(userId, {
      title: '⚠️ Low Wallet Balance',
      body: `Your wallet balance is ₹${balance.toFixed(2)}. Top up to continue buying energy.`,
      data: { type: 'low_balance', balance },
      sound: false,
    });
  }

  /**
   * Send listing expiring soon notification
   */
  static async notifyListingExpiring(sellerId, listingId, hoursLeft) {
    return this.sendToUser(sellerId, {
      title: '⏰ Listing Expiring Soon',
      body: `Your energy listing expires in ${hoursLeft} hours`,
      data: { type: 'listing_expiring', listingId },
      sound: false,
    });
  }
}

module.exports = PushNotificationService;
