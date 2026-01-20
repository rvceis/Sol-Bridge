/**
 * Report Generation Service
 * Generates CSV reports and analytics for energy transactions
 */

const db = require('../database');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const { Parser } = require('json2csv');

class ReportService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
    this.initializeReportsDir();
  }

  async initializeReportsDir() {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      logger.info('Reports directory initialized');
    } catch (error) {
      logger.error('Failed to create reports directory:', error);
    }
  }

  /**
   * Generate transaction report after successful purchase
   */
  async generateTransactionReport(transactionId) {
    try {
      logger.info(`Generating report for transaction: ${transactionId}`);

      // Fetch transaction details with all related data
      const query = `
        SELECT 
          t.id as transaction_id,
          t.created_at as transaction_date,
          t.energy_kwh,
          t.price_per_kwh,
          t.total_amount,
          t.platform_fee,
          t.net_amount,
          t.status,
          t.payment_method,
          
          -- Buyer details
          buyer.id as buyer_id,
          buyer.full_name as buyer_name,
          buyer.email as buyer_email,
          buyer.phone as buyer_phone,
          
          -- Seller details
          seller.id as seller_id,
          seller.full_name as seller_name,
          seller.email as seller_email,
          seller.phone as seller_phone,
          
          -- Listing details
          l.id as listing_id,
          l.title as listing_title,
          l.listing_type,
          l.available_energy_kwh,
          
          -- Device details
          d.device_name,
          d.panel_capacity_kw,
          d.panel_efficiency,
          
          -- Location
          loc.address_line1,
          loc.city,
          loc.state,
          loc.pincode
          
        FROM energy_transactions t
        JOIN users buyer ON t.buyer_id = buyer.id
        JOIN users seller ON t.seller_id = seller.id
        JOIN energy_listings l ON t.listing_id = l.id
        LEFT JOIN devices d ON l.device_id = d.id
        LEFT JOIN user_locations loc ON seller.id = loc.user_id
        WHERE t.id = $1
      `;

      const result = await db.query(query, [transactionId]);

      if (result.rows.length === 0) {
        throw new Error('Transaction not found');
      }

      const transaction = result.rows[0];

      // Generate CSV report
      const csvReport = await this.generateCSVReport(transaction);

      // Generate JSON report
      const jsonReport = await this.generateJSONReport(transaction);

      // Save reports to filesystem
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const csvFilename = `transaction_${transactionId}_${timestamp}.csv`;
      const jsonFilename = `transaction_${transactionId}_${timestamp}.json`;

      const csvPath = path.join(this.reportsDir, csvFilename);
      const jsonPath = path.join(this.reportsDir, jsonFilename);

      await fs.writeFile(csvPath, csvReport);
      await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));

      logger.info(`✓ Reports generated: ${csvFilename}, ${jsonFilename}`);

      return {
        success: true,
        transaction_id: transactionId,
        files: {
          csv: csvFilename,
          json: jsonFilename,
        },
        paths: {
          csv: csvPath,
          json: jsonPath,
        },
        data: jsonReport,
      };
    } catch (error) {
      logger.error('Error generating transaction report:', error);
      throw error;
    }
  }

  /**
   * Generate CSV format report
   */
  async generateCSVReport(transaction) {
    const fields = [
      { label: 'Transaction ID', value: 'transaction_id' },
      { label: 'Date', value: 'transaction_date' },
      { label: 'Status', value: 'status' },
      { label: 'Energy (kWh)', value: 'energy_kwh' },
      { label: 'Price per kWh (₹)', value: 'price_per_kwh' },
      { label: 'Total Amount (₹)', value: 'total_amount' },
      { label: 'Platform Fee (₹)', value: 'platform_fee' },
      { label: 'Net Amount (₹)', value: 'net_amount' },
      { label: 'Payment Method', value: 'payment_method' },
      { label: 'Buyer Name', value: 'buyer_name' },
      { label: 'Buyer Email', value: 'buyer_email' },
      { label: 'Buyer Phone', value: 'buyer_phone' },
      { label: 'Seller Name', value: 'seller_name' },
      { label: 'Seller Email', value: 'seller_email' },
      { label: 'Seller Phone', value: 'seller_phone' },
      { label: 'Listing Title', value: 'listing_title' },
      { label: 'Listing Type', value: 'listing_type' },
      { label: 'Device Name', value: 'device_name' },
      { label: 'Panel Capacity (kW)', value: 'panel_capacity_kw' },
      { label: 'Address', value: 'address_line1' },
      { label: 'City', value: 'city' },
      { label: 'State', value: 'state' },
      { label: 'Pincode', value: 'pincode' },
    ];

    const parser = new Parser({ fields });
    return parser.parse([transaction]);
  }

  /**
   * Generate JSON format report
   */
  async generateJSONReport(transaction) {
    return {
      report_type: 'energy_transaction',
      generated_at: new Date().toISOString(),
      transaction: {
        id: transaction.transaction_id,
        date: transaction.transaction_date,
        status: transaction.status,
        payment_method: transaction.payment_method,
      },
      energy: {
        quantity_kwh: parseFloat(transaction.energy_kwh),
        price_per_kwh: parseFloat(transaction.price_per_kwh),
        total_amount: parseFloat(transaction.total_amount),
        platform_fee: parseFloat(transaction.platform_fee),
        net_amount: parseFloat(transaction.net_amount),
      },
      buyer: {
        id: transaction.buyer_id,
        name: transaction.buyer_name,
        email: transaction.buyer_email,
        phone: transaction.buyer_phone,
      },
      seller: {
        id: transaction.seller_id,
        name: transaction.seller_name,
        email: transaction.seller_email,
        phone: transaction.seller_phone,
      },
      listing: {
        id: transaction.listing_id,
        title: transaction.listing_title,
        type: transaction.listing_type,
        available_energy_kwh: parseFloat(transaction.available_energy_kwh),
      },
      device: {
        name: transaction.device_name,
        capacity_kw: parseFloat(transaction.panel_capacity_kw),
        efficiency: parseFloat(transaction.panel_efficiency),
      },
      location: {
        address: transaction.address_line1,
        city: transaction.city,
        state: transaction.state,
        pincode: transaction.pincode,
      },
    };
  }

  /**
   * Generate analytics report for a user
   */
  async generateUserAnalytics(userId, startDate, endDate) {
    try {
      logger.info(`Generating analytics for user: ${userId}`);

      const analytics = await db.query(
        `
        SELECT 
          -- Purchase statistics (as buyer)
          COUNT(CASE WHEN buyer_id = $1 THEN 1 END) as total_purchases,
          SUM(CASE WHEN buyer_id = $1 THEN energy_kwh ELSE 0 END) as total_energy_bought,
          SUM(CASE WHEN buyer_id = $1 THEN total_amount ELSE 0 END) as total_spent,
          
          -- Sales statistics (as seller)
          COUNT(CASE WHEN seller_id = $1 THEN 1 END) as total_sales,
          SUM(CASE WHEN seller_id = $1 THEN energy_kwh ELSE 0 END) as total_energy_sold,
          SUM(CASE WHEN seller_id = $1 THEN net_amount ELSE 0 END) as total_earned,
          
          -- Average values
          AVG(CASE WHEN buyer_id = $1 OR seller_id = $1 THEN price_per_kwh ELSE NULL END) as avg_price_per_kwh,
          AVG(CASE WHEN buyer_id = $1 OR seller_id = $1 THEN total_amount ELSE NULL END) as avg_transaction_amount
          
        FROM energy_transactions
        WHERE (buyer_id = $1 OR seller_id = $1)
          AND created_at BETWEEN $2 AND $3
          AND status = 'completed'
        `,
        [userId, startDate, endDate]
      );

      const stats = analytics.rows[0];

      // Monthly trend
      const monthlyTrend = await db.query(
        `
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN buyer_id = $1 THEN energy_kwh ELSE 0 END) as energy_bought,
          SUM(CASE WHEN seller_id = $1 THEN energy_kwh ELSE 0 END) as energy_sold,
          SUM(CASE WHEN buyer_id = $1 THEN total_amount ELSE 0 END) as amount_spent,
          SUM(CASE WHEN seller_id = $1 THEN net_amount ELSE 0 END) as amount_earned
        FROM energy_transactions
        WHERE (buyer_id = $1 OR seller_id = $1)
          AND created_at BETWEEN $2 AND $3
          AND status = 'completed'
        GROUP BY month
        ORDER BY month DESC
        `,
        [userId, startDate, endDate]
      );

      const report = {
        user_id: userId,
        period: {
          start: startDate,
          end: endDate,
        },
        summary: {
          purchases: {
            count: parseInt(stats.total_purchases) || 0,
            energy_kwh: parseFloat(stats.total_energy_bought) || 0,
            amount_spent: parseFloat(stats.total_spent) || 0,
          },
          sales: {
            count: parseInt(stats.total_sales) || 0,
            energy_kwh: parseFloat(stats.total_energy_sold) || 0,
            amount_earned: parseFloat(stats.total_earned) || 0,
          },
          averages: {
            price_per_kwh: parseFloat(stats.avg_price_per_kwh) || 0,
            transaction_amount: parseFloat(stats.avg_transaction_amount) || 0,
          },
        },
        monthly_trend: monthlyTrend.rows.map((row) => ({
          month: row.month,
          transaction_count: parseInt(row.transaction_count),
          energy_bought_kwh: parseFloat(row.energy_bought) || 0,
          energy_sold_kwh: parseFloat(row.energy_sold) || 0,
          amount_spent: parseFloat(row.amount_spent) || 0,
          amount_earned: parseFloat(row.amount_earned) || 0,
        })),
      };

      // Save analytics report
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `analytics_${userId}_${timestamp}.json`;
      const filepath = path.join(this.reportsDir, filename);

      await fs.writeFile(filepath, JSON.stringify(report, null, 2));

      logger.info(`✓ Analytics report generated: ${filename}`);

      return {
        success: true,
        filename,
        filepath,
        data: report,
      };
    } catch (error) {
      logger.error('Error generating user analytics:', error);
      throw error;
    }
  }

  /**
   * Get report file
   */
  async getReport(filename) {
    try {
      const filepath = path.join(this.reportsDir, filename);
      const content = await fs.readFile(filepath, 'utf8');
      return {
        success: true,
        filename,
        content,
      };
    } catch (error) {
      logger.error('Error reading report:', error);
      throw new Error('Report not found');
    }
  }

  /**
   * List all reports for a user
   */
  async listUserReports(userId) {
    try {
      const files = await fs.readdir(this.reportsDir);
      const userFiles = files.filter((f) => f.includes(userId));

      const reports = await Promise.all(
        userFiles.map(async (filename) => {
          const filepath = path.join(this.reportsDir, filename);
          const stats = await fs.stat(filepath);
          return {
            filename,
            size: stats.size,
            created_at: stats.birthtime,
            modified_at: stats.mtime,
          };
        })
      );

      return {
        success: true,
        count: reports.length,
        reports,
      };
    } catch (error) {
      logger.error('Error listing reports:', error);
      throw error;
    }
  }
}

module.exports = new ReportService();
