const db = require('../database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

/**
 * Service for managing solar panel verification process
 */
class DocumentVerificationService {
  /**
   * Initialize a new verification request
   */
  async createVerification(userId) {
    try {
      const result = await db.query(
        `INSERT INTO solar_verifications (user_id, verification_status) 
         VALUES ($1, 'pending') 
         RETURNING *`,
        [userId]
      );
      
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating verification:', error);
      throw error;
    }
  }

  /**
   * Upload a document for verification
   */
  async uploadDocument(verificationId, documentType, filePath) {
    try {
      const validTypes = [
        'electricity_bill',
        'solar_invoice',
        'installation_certificate',
        'net_metering_agreement',
        'subsidy_approval',
        'property_proof',
        'kyc_documents'
      ];

      if (!validTypes.includes(documentType)) {
        throw new Error(`Invalid document type: ${documentType}`);
      }

      const columnName = `${documentType}_path`;
      
      const result = await db.query(
        `UPDATE solar_verifications 
         SET ${columnName} = $1, 
             verification_status = 'documents_uploaded',
             updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [filePath, verificationId]
      );

      if (result.rows.length === 0) {
        throw new Error('Verification not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error uploading document:', error);
      throw error;
    }
  }

  /**
   * Update extracted OCR data
   */
  async updateExtractedData(verificationId, extractedData) {
    try {
      const {
        consumer_number,
        panel_capacity_kw,
        installer_name,
        installer_mnre_reg,
        net_metering_number,
        subsidy_id,
        installation_date
      } = extractedData;

      const result = await db.query(
        `UPDATE solar_verifications 
         SET consumer_number = $1,
             panel_capacity_kw = $2,
             installer_name = $3,
             installer_mnre_reg = $4,
             net_metering_number = $5,
             subsidy_id = $6,
             installation_date = $7,
             verification_status = 'ocr_completed',
             updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [
          consumer_number,
          panel_capacity_kw,
          installer_name,
          installer_mnre_reg,
          net_metering_number,
          subsidy_id,
          installation_date,
          verificationId
        ]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating extracted data:', error);
      throw error;
    }
  }

  /**
   * Perform automated validation checks
   */
  async performAutomatedValidation(verificationId) {
    try {
      const verification = await this.getVerificationById(verificationId);
      
      if (!verification) {
        throw new Error('Verification not found');
      }

      const checks = {
        cross_document_check: false,
        format_validation: false,
        date_logic_check: false,
        installer_verified: false
      };

      // Cross-document consistency check
      if (verification.consumer_number && verification.net_metering_number) {
        checks.cross_document_check = true;
      }

      // Format validation
      if (verification.net_metering_number) {
        // Expected format: NM-[STATE]-[DISCOM]-[NUMBER]
        const nmFormat = /^NM-[A-Z]{2}-[A-Z]+-\d+$/;
        checks.format_validation = nmFormat.test(verification.net_metering_number);
      }

      // Date logic check
      if (verification.installation_date) {
        const installDate = new Date(verification.installation_date);
        const currentDate = new Date();
        checks.date_logic_check = installDate <= currentDate;
      }

      // Installer verification (placeholder - would check against MNRE list)
      if (verification.installer_mnre_reg) {
        checks.installer_verified = await this.verifyInstaller(verification.installer_mnre_reg);
      }

      // Update verification with check results
      const result = await db.query(
        `UPDATE solar_verifications 
         SET cross_document_check_passed = $1,
             format_validation_passed = $2,
             date_logic_check_passed = $3,
             installer_verified = $4,
             verification_status = 'auto_validated',
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          checks.cross_document_check,
          checks.format_validation,
          checks.date_logic_check,
          checks.installer_verified,
          verificationId
        ]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error performing automated validation:', error);
      throw error;
    }
  }

  /**
   * Verify installer against MNRE database
   * NOTE: This is a placeholder. Real implementation would query MNRE API or scraped data
   */
  async verifyInstaller(mnreRegNumber) {
    try {
      // Placeholder logic - would call MNRE API or check cached database
      // For now, just check format
      const mnreFormat = /^MNRE\/[A-Z]{2}\/\d{4}\/\d+$/;
      return mnreFormat.test(mnreRegNumber);
    } catch (error) {
      logger.error('Error verifying installer:', error);
      return false;
    }
  }

  /**
   * Update AI authenticity score
   */
  async updateAIScore(verificationId, authenticityScore, flags = {}) {
    try {
      const result = await db.query(
        `UPDATE solar_verifications 
         SET document_authenticity_score = $1,
             ai_flags = $2,
             verification_status = 'ai_checked',
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [authenticityScore, JSON.stringify(flags), verificationId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating AI score:', error);
      throw error;
    }
  }

  /**
   * Update government verification status
   */
  async updateGovtVerification(verificationId, verified, response = {}) {
    try {
      const result = await db.query(
        `UPDATE solar_verifications 
         SET govt_api_verified = $1,
             govt_response = $2,
             verification_status = 'govt_verified',
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [verified, JSON.stringify(response), verificationId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating government verification:', error);
      throw error;
    }
  }

  /**
   * Admin approve verification
   */
  async approveVerification(verificationId, adminId, notes = '') {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update verification
      const verificationResult = await client.query(
        `UPDATE solar_verifications 
         SET verification_status = 'approved',
             reviewed_by = $1,
             reviewed_at = NOW(),
             approved_at = NOW(),
             admin_notes = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING user_id`,
        [adminId, notes, verificationId]
      );

      if (verificationResult.rows.length === 0) {
        throw new Error('Verification not found');
      }

      const userId = verificationResult.rows[0].user_id;

      // Update user as verified seller
      await client.query(
        `UPDATE users 
         SET is_verified_seller = TRUE,
             verification_id = $1,
             verified_at = NOW()
         WHERE id = $2`,
        [verificationId, userId]
      );

      await client.query('COMMIT');

      logger.info(`Verification ${verificationId} approved for user ${userId}`);
      
      return { success: true, userId };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error approving verification:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Admin reject verification
   */
  async rejectVerification(verificationId, adminId, reason) {
    try {
      const result = await db.query(
        `UPDATE solar_verifications 
         SET verification_status = 'rejected',
             rejection_reason = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             admin_notes = $1,
             updated_at = NOW()
         WHERE id = $3
         RETURNING user_id`,
        [reason, adminId, verificationId]
      );

      if (result.rows.length === 0) {
        throw new Error('Verification not found');
      }

      logger.info(`Verification ${verificationId} rejected`);
      
      return { success: true, userId: result.rows[0].user_id };
    } catch (error) {
      logger.error('Error rejecting verification:', error);
      throw error;
    }
  }

  /**
   * Get verification by ID
   */
  async getVerificationById(verificationId) {
    try {
      const result = await db.query(
        `SELECT sv.*, 
                u.username, u.email,
                admin.username as reviewed_by_username
         FROM solar_verifications sv
         LEFT JOIN users u ON sv.user_id = u.id
         LEFT JOIN users admin ON sv.reviewed_by = admin.id
         WHERE sv.id = $1`,
        [verificationId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting verification:', error);
      throw error;
    }
  }

  /**
   * Get verification by user ID
   */
  async getVerificationByUserId(userId) {
    try {
      const result = await db.query(
        `SELECT * FROM solar_verifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting verification by user:', error);
      throw error;
    }
  }

  /**
   * Get pending verifications for admin review
   */
  async getPendingVerifications(limit = 50, offset = 0) {
    try {
      const result = await db.query(
        `SELECT sv.*, 
                u.username, u.email, u.phone
         FROM solar_verifications sv
         JOIN users u ON sv.user_id = u.id
         WHERE sv.verification_status IN ('auto_validated', 'ai_checked', 'govt_verified', 'documents_uploaded')
         ORDER BY sv.submitted_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await db.query(
        `SELECT COUNT(*) as total 
         FROM solar_verifications 
         WHERE verification_status IN ('auto_validated', 'ai_checked', 'govt_verified', 'documents_uploaded')`
      );

      return {
        verifications: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error getting pending verifications:', error);
      throw error;
    }
  }

  /**
   * Get verification statistics
   */
  async getVerificationStats() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_verifications,
          COUNT(*) FILTER (WHERE verification_status = 'pending') as pending,
          COUNT(*) FILTER (WHERE verification_status = 'documents_uploaded') as documents_uploaded,
          COUNT(*) FILTER (WHERE verification_status IN ('auto_validated', 'ai_checked', 'govt_verified')) as awaiting_review,
          COUNT(*) FILTER (WHERE verification_status = 'approved') as approved,
          COUNT(*) FILTER (WHERE verification_status = 'rejected') as rejected,
          AVG(EXTRACT(EPOCH FROM (approved_at - submitted_at))/3600) FILTER (WHERE verification_status = 'approved') as avg_approval_time_hours
        FROM solar_verifications
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting verification stats:', error);
      throw error;
    }
  }

  /**
   * Delete uploaded documents (cleanup)
   */
  async deleteDocuments(verificationId) {
    try {
      const verification = await this.getVerificationById(verificationId);
      
      if (!verification) {
        throw new Error('Verification not found');
      }

      const documentPaths = [
        verification.electricity_bill_path,
        verification.solar_invoice_path,
        verification.installation_certificate_path,
        verification.net_metering_agreement_path,
        verification.subsidy_approval_path,
        verification.property_proof_path,
        verification.kyc_documents_path
      ];

      // Delete files from storage
      for (const filePath of documentPaths) {
        if (filePath) {
          try {
            await fs.unlink(filePath);
            logger.info(`Deleted document: ${filePath}`);
          } catch (err) {
            logger.warn(`Failed to delete document: ${filePath}`, err);
          }
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Error deleting documents:', error);
      throw error;
    }
  }
}

module.exports = new DocumentVerificationService();
