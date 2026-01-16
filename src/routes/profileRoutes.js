const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ProfileController = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');

// Configure multer for document uploads
const uploadDir = path.join(__dirname, '../../uploads/documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userUploadDir = path.join(uploadDir, req.user.id);
    if (!fs.existsSync(userUploadDir)) {
      fs.mkdirSync(userUploadDir, { recursive: true });
    }
    cb(null, userUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/gif'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and images allowed'));
    }
  }
});

// All routes require authentication
router.use(authenticate);

// Profile routes
router.get('/profile', ProfileController.getProfile);
router.put('/profile', ProfileController.updateProfile);

// Address routes
router.get('/addresses', ProfileController.getAddresses);
router.post('/addresses', ProfileController.addAddress);
router.put('/addresses/:id', ProfileController.updateAddress);
router.delete('/addresses/:id', ProfileController.deleteAddress);

// Payment method routes
router.get('/payment-methods', ProfileController.getPaymentMethods);
router.post('/payment-methods', ProfileController.addPaymentMethod);
router.delete('/payment-methods/:id', ProfileController.deletePaymentMethod);

// Document routes
router.get('/documents', ProfileController.getDocuments);
router.post('/documents', upload.single('document'), ProfileController.uploadDocument);
router.delete('/documents/:id', ProfileController.deleteDocument);

// Preferences routes
router.get('/preferences', ProfileController.getPreferences);
router.put('/preferences', ProfileController.updatePreferences);

module.exports = router;
