const userService = require('../services/UserManagementService');
const { asyncHandler } = require('../utils/errors');
const { schemas, validate } = require('../utils/validation');
const logger = require('../utils/logger');

// Register
const register = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.register);
  const result = await userService.register(data);

  logger.info({ action: 'user_registered', email: data.email });
  res.success(result, 'User registered successfully', 201);
});

// Login
const login = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.login);
  const result = await userService.login(data.email, data.password);

  logger.info({ action: 'user_login', email: data.email });
  res.success(result, 'Login successful');
});

// Verify Email
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.error('ValidationError', 'Verification token required', 400);
  }

  const result = await userService.verifyEmail(token);
  logger.info({ action: 'email_verified' });
  res.success(result, 'Email verified successfully');
});

// Request Password Reset
const requestPasswordReset = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.passwordReset);
  const result = await userService.requestPasswordReset(data.email);

  logger.info({ action: 'password_reset_requested', email: data.email });
  res.success(result, 'Password reset email sent');
});

// Reset Password
const resetPassword = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.passwordResetConfirm);
  const result = await userService.resetPassword(data.token, data.newPassword);

  logger.info({ action: 'password_reset_completed' });
  res.success(result, 'Password reset successfully');
});

// Refresh Token
const refreshAccessToken = asyncHandler(async (req, res) => {
  const data = validate(req.body, schemas.refreshToken);
  const result = await userService.refreshAccessToken(data.refreshToken);

  logger.info({ action: 'token_refreshed' });
  res.success(result, 'Token refreshed successfully');
});

// Get Profile
const getProfile = asyncHandler(async (req, res) => {
  const result = await userService.getProfile(req.user.id);
  logger.info({ action: 'profile_fetched', userId: req.user.id });
  res.success(result, 'Profile fetched successfully');
});

// Update Profile
const updateProfile = asyncHandler(async (req, res) => {
  const result = await userService.updateProfile(req.user.id, req.body);
  logger.info({ action: 'profile_updated', userId: req.user.id, updates: Object.keys(req.body) });
  res.success(result, 'Profile updated successfully');
});

module.exports = {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  refreshAccessToken,
  getProfile,
  updateProfile,
};
