const ProfileService = require('../services/ProfileService');
const logger = require('../utils/logger');

class ProfileController {
  // Get user profile
  async getProfile(req, res) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }
      
      const profile = await ProfileService.getUserProfile(userId);
      
      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      logger.error('Error in getProfile:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get profile'
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }
      const updates = req.body;
      
      const profile = await ProfileService.updateUserProfile(userId, updates);
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: profile
      });
    } catch (error) {
      logger.error('Error in updateProfile:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update profile'
      });
    }
  }

  // Get addresses
  async getAddresses(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }
      const addresses = await ProfileService.getUserAddresses(userId);
      
      res.json({
        success: true,
        data: addresses
      });
    } catch (error) {
      logger.error('Error in getAddresses:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get addresses'
      });
    }
  }

  // Add address
  async addAddress(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }
      const addressData = req.body;
      
      const address = await ProfileService.addUserAddress(userId, addressData);
      
      res.status(201).json({
        success: true,
        message: 'Address added successfully',
        data: address
      });
    } catch (error) {
      logger.error('Error in addAddress:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to add address'
      });
    }
  }

  // Update address
  async updateAddress(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }
      const { id } = req.params;
      const updates = req.body;
      
      const address = await ProfileService.updateUserAddress(userId, id, updates);
      
      res.json({
        success: true,
        message: 'Address updated successfully',
        data: address
      });
    } catch (error) {
      logger.error('Error in updateAddress:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update address'
      });
    }
  }

  // Delete address
  async deleteAddress(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }
      const { id } = req.params;
      
      await ProfileService.deleteUserAddress(userId, id);
      
      res.json({
        success: true,
        message: 'Address deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteAddress:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete address'
      });
    }
  }

  // Get payment methods
  async getPaymentMethods(req, res) {
    try {
      const userId = req.user.id;
      const paymentMethods = await ProfileService.getPaymentMethods(userId);
      
      res.json({
        success: true,
        data: paymentMethods
      });
    } catch (error) {
      logger.error('Error in getPaymentMethods:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get payment methods'
      });
    }
  }

  // Add payment method
  async addPaymentMethod(req, res) {
    try {
      const userId = req.user.id;
      const paymentData = req.body;
      
      const paymentMethod = await ProfileService.addPaymentMethod(userId, paymentData);
      
      res.status(201).json({
        success: true,
        message: 'Payment method added successfully',
        data: paymentMethod
      });
    } catch (error) {
      logger.error('Error in addPaymentMethod:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to add payment method'
      });
    }
  }

  // Delete payment method
  async deletePaymentMethod(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      await ProfileService.deletePaymentMethod(userId, id);
      
      res.json({
        success: true,
        message: 'Payment method deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deletePaymentMethod:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete payment method'
      });
    }
  }

  // Get documents
  async getDocuments(req, res) {
    try {
      const userId = req.user.id;
      const documents = await ProfileService.getUserDocuments(userId);
      
      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      logger.error('Error in getDocuments:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get documents'
      });
    }
  }

  // Upload document
  async uploadDocument(req, res) {
    try {
      const userId = req.user.id;
      const { document_type, document_name } = req.body;
      const file = req.file;

      // Validate input
      if (!document_type) {
        return res.status(400).json({
          success: false,
          error: 'document_type is required'
        });
      }

      if (!document_name || !document_name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'document_name is required'
        });
      }

      // For file-based uploads (when using multer middleware)
      let filePath = null;
      let fileSize = 0;
      let mimeType = 'application/octet-stream';

      if (file) {
        // File was uploaded via multipart/form-data
        filePath = file.path;
        fileSize = file.size;
        mimeType = file.mimetype;

        // Validate file size (max 10MB)
        if (fileSize > 10 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            error: 'File size exceeds 10MB limit'
          });
        }

        // Validate file type
        const allowedMimeTypes = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/jpg',
          'image/gif'
        ];

        if (!allowedMimeTypes.includes(mimeType)) {
          return res.status(400).json({
            success: false,
            error: 'File type not allowed. Only PDF and images (JPG, PNG, GIF) are accepted'
          });
        }
      } else {
        // No file provided - use placeholder
        filePath = `/uploads/documents/${userId}/${Date.now()}-${document_name}`;
        fileSize = 0;
      }

      // Validate document type
      const validTypes = ['identity', 'address_proof', 'bank_statement', 'pan_card', 'aadhaar', 'other'];
      if (!validTypes.includes(document_type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid document_type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      const documentData = {
        document_type,
        document_name: document_name.trim(),
        file_path: filePath,
        file_size: fileSize,
        mime_type: mimeType
      };
      
      const document = await ProfileService.addUserDocument(userId, documentData);
      
      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        data: document
      });
    } catch (error) {
      logger.error('Error in uploadDocument:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload document'
      });
    }
  }

  // Delete document
  async deleteDocument(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      await ProfileService.deleteUserDocument(userId, id);
      
      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteDocument:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete document'
      });
    }
  }

  // Get preferences
  async getPreferences(req, res) {
    try {
      const userId = req.user.id;
      const preferences = await ProfileService.getUserPreferences(userId);
      
      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      logger.error('Error in getPreferences:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get preferences'
      });
    }
  }

  // Update preferences
  async updatePreferences(req, res) {
    try {
      const userId = req.user.id;
      const updates = req.body;
      
      const preferences = await ProfileService.updateUserPreferences(userId, updates);
      
      res.json({
        success: true,
        message: 'Preferences updated successfully',
        data: preferences
      });
    } catch (error) {
      logger.error('Error in updatePreferences:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update preferences'
      });
    }
  }
}

module.exports = new ProfileController();
