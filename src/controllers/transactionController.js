const transactionService = require('../services/TransactionService');
const { asyncHandler } = require('../utils/errors');

// Get wallet balance
const getWalletBalance = asyncHandler(async (req, res) => {
  const wallet = await transactionService.getWalletBalance(req.user.id);
  res.json(wallet);
});

// Get transaction history
const getTransactionHistory = asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const transactions = await transactionService.getTransactionHistory(
    req.user.id,
    parseInt(limit),
    parseInt(offset)
  );

  res.json({
    transactions,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Top-up wallet (initiate payment)
const topupWallet = asyncHandler(async (req, res) => {
  const { amount, paymentMethod } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Valid amount required',
    });
  }

  // TODO: Call payment gateway (Razorpay)
  // For now, return payment initiation response
  res.json({
    status: 'payment_initiated',
    amount,
    paymentMethod,
    message: 'Redirect to payment gateway',
    // paymentUrl would come from Razorpay integration
  });
});

// Process payment callback (from payment gateway)
const processPaymentCallback = asyncHandler(async (req, res) => {
  const { userId, amount, paymentMethod, paymentGatewayTxnId, status } = req.body;

  if (status === 'success') {
    const result = await transactionService.processWalletTopup(
      userId,
      amount,
      paymentMethod,
      paymentGatewayTxnId
    );

    res.json({
      status: 'success',
      message: 'Wallet topped up successfully',
      wallet: result,
    });
  } else {
    res.status(400).json({
      error: 'PaymentError',
      message: 'Payment failed',
      status: status,
    });
  }
});

// Request withdrawal
const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, bankAccount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Valid amount required',
    });
  }

  if (!bankAccount) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Bank account required',
    });
  }

  const result = await transactionService.processWithdrawal(
    req.user.id,
    amount,
    bankAccount
  );

  res.json({
    status: 'withdrawal_initiated',
    message: 'Withdrawal request submitted',
    withdrawal: result,
  });
});

// Get platform metrics (admin only)
const getPlatformMetrics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'startDate and endDate required',
    });
  }

  const metrics = await transactionService.getPlatformMetrics(
    new Date(startDate),
    new Date(endDate)
  );

  res.json(metrics);
});

module.exports = {
  getWalletBalance,
  getTransactionHistory,
  topupWallet,
  processPaymentCallback,
  requestWithdrawal,
  getPlatformMetrics,
};
