const DocumentVerificationService = require('../services/DocumentVerificationService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/errors');

/**
 * Create a new verification request
 */
const createVerification = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Check if user already has a pending/approved verification
  const existing = await DocumentVerificationService.getVerificationByUserId(userId);
  
  if (existing && ['pending', 'documents_uploaded', 'auto_validated', 'ai_checked', 'approved'].includes(existing.verification_status)) {
    return res.status(400).json({
      error: 'VerificationExistsError',
      message: `You already have a ${existing.verification_status} verification request`,
      verificationId: existing.id
    });
  }

  const verification = await DocumentVerificationService.createVerification(userId);

  res.status(201).json({
    message: 'Verification request created',
    verification
  });
});

/**
 * Upload a document for verification
 * Expects multer middleware to handle file upload
 */
const uploadDocument = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;
  const { documentType } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'No file uploaded'
    });
  }

  // Verify ownership
  const verification = await DocumentVerificationService.getVerificationById(verificationId);
  
  if (!verification) {
    return res.status(404).json({
      error: 'NotFoundError',
      message: 'Verification not found'
    });
  }

  if (verification.user_id !== req.user.id) {
    return res.status(403).json({
      error: 'ForbiddenError',
      message: 'Not authorized to upload to this verification'
    });
  }

  const updatedVerification = await DocumentVerificationService.uploadDocument(
    verificationId,
    documentType,
    file.path
  );

  res.json({
    message: 'Document uploaded successfully',
    verification: updatedVerification,
    file: {
      originalName: file.originalname,
      size: file.size,
      path: file.path
    }
  });
});

/**
 * Submit verification for review (triggers automated validation)
 */
const submitVerification = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;

  // Verify ownership
  const verification = await DocumentVerificationService.getVerificationById(verificationId);
  
  if (!verification) {
    return res.status(404).json({
      error: 'NotFoundError',
      message: 'Verification not found'
    });
  }

  if (verification.user_id !== req.user.id) {
    return res.status(403).json({
      error: 'ForbiddenError',
      message: 'Not authorized'
    });
  }

  // Check if minimum documents are uploaded
  const requiredDocs = ['electricity_bill_path', 'solar_invoice_path', 'installation_certificate_path'];
  const missingDocs = requiredDocs.filter(doc => !verification[doc]);

  if (missingDocs.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Required documents missing',
      missingDocuments: missingDocs.map(d => d.replace('_path', ''))
    });
  }

  // Trigger automated validation
  const validatedVerification = await DocumentVerificationService.performAutomatedValidation(verificationId);

  res.json({
    message: 'Verification submitted for review',
    verification: validatedVerification
  });
});

/**
 * Update extracted OCR data
 * Called by OCR service after processing documents
 */
const updateOCRData = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;
  const extractedData = req.body;

  const verification = await DocumentVerificationService.updateExtractedData(
    verificationId,
    extractedData
  );

  res.json({
    message: 'OCR data updated',
    verification
  });
});

/**
 * Update AI authenticity score
 * Called by AI service after analyzing documents
 */
const updateAIScore = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;
  const { authenticityScore, flags } = req.body;

  const verification = await DocumentVerificationService.updateAIScore(
    verificationId,
    authenticityScore,
    flags
  );

  res.json({
    message: 'AI score updated',
    verification
  });
});

/**
 * Get verification details
 */
const getVerification = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;

  const verification = await DocumentVerificationService.getVerificationById(verificationId);
  
  if (!verification) {
    return res.status(404).json({
      error: 'NotFoundError',
      message: 'Verification not found'
    });
  }

  // Check authorization (user can view their own, admin can view all)
  if (verification.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'ForbiddenError',
      message: 'Not authorized'
    });
  }

  res.json({ verification });
});

/**
 * Get user's own verification
 */
const getMyVerification = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const verification = await DocumentVerificationService.getVerificationByUserId(userId);

  if (!verification) {
    return res.status(404).json({
      error: 'NotFoundError',
      message: 'No verification found'
    });
  }

  res.json({ verification });
});

/**
 * ADMIN: Get pending verifications
 */
const getPendingVerifications = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  const result = await DocumentVerificationService.getPendingVerifications(limit, offset);

  res.json(result);
});

/**
 * ADMIN: Approve verification
 */
const approveVerification = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;
  const { notes } = req.body;
  const adminId = req.user.id;

  const result = await DocumentVerificationService.approveVerification(
    verificationId,
    adminId,
    notes
  );

  res.json({
    message: 'Verification approved',
    ...result
  });
});

/**
 * ADMIN: Reject verification
 */
const rejectVerification = asyncHandler(async (req, res) => {
  const { verificationId } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id;

  if (!reason) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Rejection reason is required'
    });
  }

  const result = await DocumentVerificationService.rejectVerification(
    verificationId,
    adminId,
    reason
  );

  res.json({
    message: 'Verification rejected',
    ...result
  });
});

/**
 * ADMIN: Get verification statistics
 */
const getVerificationStats = asyncHandler(async (req, res) => {
  const stats = await DocumentVerificationService.getVerificationStats();

  res.json({ stats });
});

module.exports = {
  createVerification,
  uploadDocument,
  submitVerification,
  updateOCRData,
  updateAIScore,
  getVerification,
  getMyVerification,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  getVerificationStats
};
