/**
 * Profile & KYC Routes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ProfileService = require('../services/ProfileService');
const PushNotificationService = require('../services/PushNotificationService');
const logger = require('../utils/logger');

/**
 * @route   GET /api/v1/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const profile = await ProfileService.getProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    logger.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * @route   POST /api/v1/profile/kyc/submit
 * @desc    Submit KYC documents
 * @access  Private
 */
router.post('/kyc/submit', authenticate, async (req, res) => {
  try {
    const { documents } = req.body;

    if (!documents || documents.length === 0) {
      return res.status(400).json({ error: 'Documents are required' });
    }

    await ProfileService.submitKYC(req.user.id, documents);

    res.json({ message: 'KYC submitted successfully' });
  } catch (error) {
    logger.error('Error submitting KYC:', error);
    res.status(500).json({ error: 'Failed to submit KYC' });
  }
});

/**
 * @route   GET /api/v1/profile/kyc/history
 * @desc    Get KYC review history
 * @access  Private
 */
router.get('/kyc/history', authenticate, async (req, res) => {
  try {
    const history = await ProfileService.getKYCHistory(req.user.id);
    res.json(history);
  } catch (error) {
    logger.error('Error fetching KYC history:', error);
    res.status(500).json({ error: 'Failed to fetch KYC history' });
  }
});

/**
 * @route   POST /api/v1/profile/kyc/approve/:userId
 * @desc    Admin: Approve user KYC
 * @access  Private (Admin)
 */
router.post('/kyc/approve/:userId', authenticate, async (req, res) => {
  try {
    // TODO: Add admin role check
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { userId } = req.params;
    const { notes } = req.body;

    await ProfileService.approveKYC(userId, req.user.id, notes);

    // Send notification
    await PushNotificationService.notifyVerificationApproved(userId);

    res.json({ message: 'KYC approved successfully' });
  } catch (error) {
    logger.error('Error approving KYC:', error);
    res.status(500).json({ error: 'Failed to approve KYC' });
  }
});

/**
 * @route   POST /api/v1/profile/kyc/reject/:userId
 * @desc    Admin: Reject user KYC
 * @access  Private (Admin)
 */
router.post('/kyc/reject/:userId', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    await ProfileService.rejectKYC(userId, req.user.id, reason);

    res.json({ message: 'KYC rejected' });
  } catch (error) {
    logger.error('Error rejecting KYC:', error);
    res.status(500).json({ error: 'Failed to reject KYC' });
  }
});

module.exports = router;
