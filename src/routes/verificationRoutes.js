const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../middleware/auth');
const verificationController = require('../controllers/verificationController');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/verifications');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images and PDFs only
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ===== USER ROUTES (require authentication) =====

/**
 * POST /api/v1/verification/create
 * Create a new verification request
 */
router.post('/create', authenticate, verificationController.createVerification);

/**
 * POST /api/v1/verification/:verificationId/upload
 * Upload a document for verification
 * Body: documentType (string), file (multipart/form-data)
 */
router.post(
  '/:verificationId/upload',
  authenticate,
  upload.single('document'),
  verificationController.uploadDocument
);

/**
 * POST /api/v1/verification/:verificationId/submit
 * Submit verification for review (triggers automated validation)
 */
router.post('/:verificationId/submit', authenticate, verificationController.submitVerification);

/**
 * GET /api/v1/verification/my-verification
 * Get user's own verification
 */
router.get('/my-verification', authenticate, verificationController.getMyVerification);

/**
 * GET /api/v1/verification/:verificationId
 * Get verification details
 */
router.get('/:verificationId', authenticate, verificationController.getVerification);

// ===== ADMIN ROUTES (require admin role) =====

/**
 * GET /api/v1/verification/admin/pending
 * Get all pending verifications for admin review
 * Query params: limit, offset
 */
router.get(
  '/admin/pending',
  authenticate,
  authorize(['admin']),
  verificationController.getPendingVerifications
);

/**
 * PUT /api/v1/verification/admin/:verificationId/approve
 * Approve a verification
 * Body: notes (optional)
 */
router.put(
  '/admin/:verificationId/approve',
  authenticate,
  authorize(['admin']),
  verificationController.approveVerification
);

/**
 * PUT /api/v1/verification/admin/:verificationId/reject
 * Reject a verification
 * Body: reason (required)
 */
router.put(
  '/admin/:verificationId/reject',
  authenticate,
  authorize(['admin']),
  verificationController.rejectVerification
);

/**
 * GET /api/v1/verification/admin/stats
 * Get verification statistics
 */
router.get(
  '/admin/stats',
  authenticate,
  authorize(['admin']),
  verificationController.getVerificationStats
);

// ===== INTERNAL ROUTES (for OCR/AI services) =====

/**
 * PUT /api/v1/verification/:verificationId/ocr
 * Update extracted OCR data
 * Body: extracted data object
 */
router.put('/:verificationId/ocr', authenticate, verificationController.updateOCRData);

/**
 * PUT /api/v1/verification/:verificationId/ai-score
 * Update AI authenticity score
 * Body: authenticityScore (number), flags (object)
 */
router.put('/:verificationId/ai-score', authenticate, verificationController.updateAIScore);

module.exports = router;
