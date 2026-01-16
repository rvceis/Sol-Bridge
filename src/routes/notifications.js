/**
 * Push Token Routes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const PushTokenModel = require('../models/PushToken');
const logger = require('../utils/logger');

/**
 * @route   POST /api/v1/notifications/register-token
 * @desc    Register device push token
 * @access  Private
 */
router.post('/register-token', authenticate, async (req, res) => {
  try {
    const { token, platform, deviceName } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Push token is required' });
    }

    const savedToken = await PushTokenModel.saveToken(
      req.user.id,
      token,
      { platform, deviceName }
    );

    logger.info(`Registered push token for user ${req.user.id}`);

    res.json({
      message: 'Push token registered successfully',
      token: savedToken,
    });
  } catch (error) {
    logger.error('Error registering push token:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

/**
 * @route   DELETE /api/v1/notifications/deregister-token
 * @desc    Deactivate push token
 * @access  Private
 */
router.delete('/deregister-token', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Push token is required' });
    }

    await PushTokenModel.deactivateToken(req.user.id, token);

    logger.info(`Deactivated push token for user ${req.user.id}`);

    res.json({ message: 'Push token deactivated successfully' });
  } catch (error) {
    logger.error('Error deactivating push token:', error);
    res.status(500).json({ error: 'Failed to deactivate push token' });
  }
});

/**
 * @route   GET /api/v1/notifications/tokens
 * @desc    Get user's active tokens
 * @access  Private
 */
router.get('/tokens', authenticate, async (req, res) => {
  try {
    const tokens = await PushTokenModel.getUserTokens(req.user.id);

    res.json({ tokens });
  } catch (error) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

module.exports = router;
