/**
 * Bank Account Routes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const BankAccountService = require('../services/BankAccountService');
const logger = require('../utils/logger');

/**
 * @route   POST /api/v1/bank-accounts
 * @desc    Add bank account
 * @access  Private
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      branchName,
      accountType,
    } = req.body;

    // Validation
    if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
      return res.status(400).json({ 
        error: 'Account holder name, account number, IFSC code, and bank name are required' 
      });
    }

    const account = await BankAccountService.addBankAccount(req.user.id, {
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      branchName,
      accountType,
    });

    res.status(201).json(account);
  } catch (error) {
    logger.error('Error adding bank account:', error);
    res.status(500).json({ error: 'Failed to add bank account' });
  }
});

/**
 * @route   GET /api/v1/bank-accounts
 * @desc    Get user bank accounts
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const accounts = await BankAccountService.getUserBankAccounts(req.user.id);
    res.json(accounts);
  } catch (error) {
    logger.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

/**
 * @route   PUT /api/v1/bank-accounts/:accountId/primary
 * @desc    Set primary bank account
 * @access  Private
 */
router.put('/:accountId/primary', authenticate, async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await BankAccountService.setPrimaryAccount(req.user.id, accountId);
    res.json(account);
  } catch (error) {
    logger.error('Error setting primary account:', error);
    res.status(500).json({ error: error.message || 'Failed to set primary account' });
  }
});

/**
 * @route   DELETE /api/v1/bank-accounts/:accountId
 * @desc    Delete bank account
 * @access  Private
 */
router.delete('/:accountId', authenticate, async (req, res) => {
  try {
    const { accountId } = req.params;
    await BankAccountService.deleteBankAccount(req.user.id, accountId);
    res.json({ message: 'Bank account deleted successfully' });
  } catch (error) {
    logger.error('Error deleting bank account:', error);
    res.status(500).json({ error: error.message || 'Failed to delete bank account' });
  }
});

/**
 * @route   POST /api/v1/bank-accounts/:accountId/verify
 * @desc    Admin: Verify bank account
 * @access  Private (Admin)
 */
router.post('/:accountId/verify', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { accountId } = req.params;
    const account = await BankAccountService.verifyBankAccount(accountId, req.user.id);
    res.json(account);
  } catch (error) {
    logger.error('Error verifying bank account:', error);
    res.status(500).json({ error: 'Failed to verify bank account' });
  }
});

module.exports = router;
