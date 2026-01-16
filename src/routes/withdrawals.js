/**
 * Withdrawal Routes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const WithdrawalService = require('../services/WithdrawalService');
const logger = require('../utils/logger');

/**
 * @route   POST /api/v1/withdrawals
 * @desc    Request withdrawal
 * @access  Private
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { amount, bankAccountId } = req.body;

    if (!amount || !bankAccountId) {
      return res.status(400).json({ 
        error: 'Amount and bank account ID are required' 
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const withdrawal = await WithdrawalService.requestWithdrawal(
      req.user.id,
      amount,
      bankAccountId
    );

    res.status(201).json({
      message: 'Withdrawal request submitted successfully',
      withdrawal,
    });
  } catch (error) {
    logger.error('Error requesting withdrawal:', error);
    res.status(500).json({ error: error.message || 'Failed to request withdrawal' });
  }
});

/**
 * @route   GET /api/v1/withdrawals
 * @desc    Get user withdrawal requests
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    const withdrawals = await WithdrawalService.getUserWithdrawals(req.user.id, status);
    res.json(withdrawals);
  } catch (error) {
    logger.error('Error fetching withdrawals:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

/**
 * @route   GET /api/v1/withdrawals/pending
 * @desc    Admin: Get pending withdrawal requests
 * @access  Private (Admin)
 */
router.get('/pending', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const withdrawals = await WithdrawalService.getPendingWithdrawals();
    res.json(withdrawals);
  } catch (error) {
    logger.error('Error fetching pending withdrawals:', error);
    res.status(500).json({ error: 'Failed to fetch pending withdrawals' });
  }
});

/**
 * @route   POST /api/v1/withdrawals/:withdrawalId/approve
 * @desc    Admin: Approve withdrawal
 * @access  Private (Admin)
 */
router.post('/:withdrawalId/approve', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { withdrawalId } = req.params;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    await WithdrawalService.approveWithdrawal(withdrawalId, req.user.id, transactionId);

    res.json({ message: 'Withdrawal approved successfully' });
  } catch (error) {
    logger.error('Error approving withdrawal:', error);
    res.status(500).json({ error: error.message || 'Failed to approve withdrawal' });
  }
});

/**
 * @route   POST /api/v1/withdrawals/:withdrawalId/reject
 * @desc    Admin: Reject withdrawal
 * @access  Private (Admin)
 */
router.post('/:withdrawalId/reject', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { withdrawalId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    await WithdrawalService.rejectWithdrawal(withdrawalId, req.user.id, reason);

    res.json({ message: 'Withdrawal rejected successfully' });
  } catch (error) {
    logger.error('Error rejecting withdrawal:', error);
    res.status(500).json({ error: error.message || 'Failed to reject withdrawal' });
  }
});

module.exports = router;
