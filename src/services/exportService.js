/**
 * CSV Export Service
 * Exports transaction history, production data, billing records
 */

const { Parser } = require('json2csv');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

class ExportService {
  constructor() {
    this.outputDir = path.join(__dirname, '../../generated/exports');
    this._ensureDirectoryExists();
  }

  _ensureDirectoryExists() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Export Transaction History
   */
  async exportTransactionHistory(userId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          t.id,
          t.transaction_type,
          t.amount,
          t.status,
          t.description,
          t.razorpay_payment_id,
          t.created_at
        FROM transactions t
        WHERE t.user_id = $1
          AND t.created_at >= $2
          AND t.created_at <= $3
        ORDER BY t.created_at DESC
      `;

      const result = await db.query(query, [userId, startDate, endDate]);

      if (result.rows.length === 0) {
        return { success: false, message: 'No transactions found' };
      }

      // Format data
      const formattedData = result.rows.map((row) => ({
        'Transaction ID': row.id,
        'Type': row.transaction_type,
        'Amount (₹)': row.amount,
        'Status': row.status,
        'Description': row.description,
        'Payment ID': row.razorpay_payment_id || 'N/A',
        'Date': new Date(row.created_at).toLocaleString(),
      }));

      const filename = `transactions_${userId}_${Date.now()}.csv`;
      const filepath = path.join(this.outputDir, filename);

      const parser = new Parser();
      const csv = parser.parse(formattedData);

      fs.writeFileSync(filepath, csv);

      return { success: true, filename, filepath };
    } catch (error) {
      console.error('Transaction export error:', error);
      throw error;
    }
  }

  /**
   * Export Production Data (for Buyers)
   */
  async exportProductionData(userId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          i.id as investment_id,
          i.panel_capacity_kw,
          i.host_location_city,
          i.host_location_state,
          i.installation_date,
          er.timestamp,
          er.voltage,
          er.current,
          er.power,
          er.energy_kwh,
          er.temperature
        FROM investments i
        JOIN devices d ON i.host_id = d.user_id
        JOIN energy_readings er ON d.id = er.device_id
        WHERE i.buyer_id = $1
          AND er.timestamp >= $2
          AND er.timestamp <= $3
        ORDER BY er.timestamp DESC
      `;

      const result = await db.query(query, [userId, startDate, endDate]);

      if (result.rows.length === 0) {
        return { success: false, message: 'No production data found' };
      }

      const formattedData = result.rows.map((row) => ({
        'Investment ID': row.investment_id,
        'Capacity (kW)': row.panel_capacity_kw,
        'Location': `${row.host_location_city}, ${row.host_location_state}`,
        'Timestamp': new Date(row.timestamp).toLocaleString(),
        'Voltage (V)': row.voltage,
        'Current (A)': row.current,
        'Power (W)': row.power,
        'Energy (kWh)': row.energy_kwh,
        'Temperature (°C)': row.temperature,
      }));

      const filename = `production_${userId}_${Date.now()}.csv`;
      const filepath = path.join(this.outputDir, filename);

      const parser = new Parser();
      const csv = parser.parse(formattedData);

      fs.writeFileSync(filepath, csv);

      return { success: true, filename, filepath };
    } catch (error) {
      console.error('Production export error:', error);
      throw error;
    }
  }

  /**
   * Export Billing Data (for Industries)
   */
  async exportBillingData(industryId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          ic.id as consumption_id,
          ic.consumption_date,
          ic.energy_consumed_kwh,
          ic.price_per_kwh,
          ic.amount_paid,
          ic.carbon_offset_kg,
          i.panel_capacity_kw,
          b.full_name as supplier_name,
          CONCAT(hs.city, ', ', hs.state) as supplier_location
        FROM industry_consumption ic
        LEFT JOIN investments i ON ic.investment_id = i.id
        LEFT JOIN users b ON i.buyer_id = b.id
        LEFT JOIN host_spaces hs ON i.host_space_id = hs.id
        WHERE ic.industry_id = $1
          AND ic.consumption_date >= $2
          AND ic.consumption_date <= $3
        ORDER BY ic.consumption_date DESC
      `;

      const result = await db.query(query, [industryId, startDate, endDate]);

      if (result.rows.length === 0) {
        return { success: false, message: 'No billing data found' };
      }

      const formattedData = result.rows.map((row) => ({
        'Billing ID': row.consumption_id,
        'Date': new Date(row.consumption_date).toLocaleDateString(),
        'Energy (kWh)': row.energy_consumed_kwh,
        'Price per kWh (₹)': row.price_per_kwh,
        'Amount Paid (₹)': row.amount_paid,
        'Carbon Offset (kg)': row.carbon_offset_kg,
        'Supplier': row.supplier_name || 'Multiple',
        'Location': row.supplier_location || 'N/A',
      }));

      const filename = `billing_${industryId}_${Date.now()}.csv`;
      const filepath = path.join(this.outputDir, filename);

      const parser = new Parser();
      const csv = parser.parse(formattedData);

      fs.writeFileSync(filepath, csv);

      return { success: true, filename, filepath };
    } catch (error) {
      console.error('Billing export error:', error);
      throw error;
    }
  }

  /**
   * Export Investment Summary (for Buyers)
   */
  async exportInvestmentSummary(userId) {
    try {
      const query = `
        SELECT 
          i.id,
          i.panel_capacity_kw,
          CONCAT(hs.city, ', ', hs.state) as location,
          h.full_name as host_name,
          ind.company_name as industry_name,
          i.investment_amount,
          i.monthly_production_kwh,
          i.net_monthly_profit,
          i.roi_percentage,
          i.total_earned_lifetime,
          i.status,
          i.installation_date
        FROM investments i
        JOIN users h ON i.host_id = h.id
        JOIN host_spaces hs ON i.host_space_id = hs.id
        LEFT JOIN industry_contracts ic ON i.id = ic.investment_id
        LEFT JOIN industries ind ON ic.industry_id = ind.id
        WHERE i.buyer_id = $1
        ORDER BY i.installation_date DESC
      `;

      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        return { success: false, message: 'No investments found' };
      }

      const formattedData = result.rows.map((row) => ({
        'Investment ID': row.id,
        'Capacity (kW)': row.panel_capacity_kw,
        'Location': row.location,
        'Host': row.host_name,
        'Industry Buyer': row.industry_name || 'Not Assigned',
        'Investment (₹)': row.investment_amount,
        'Monthly Production (kWh)': row.monthly_production_kwh,
        'Monthly Profit (₹)': row.net_monthly_profit,
        'ROI (%)': row.roi_percentage,
        'Total Earned (₹)': row.total_earned_lifetime,
        'Status': row.status,
        'Installation Date': new Date(row.installation_date).toLocaleDateString(),
      }));

      const filename = `investments_summary_${userId}_${Date.now()}.csv`;
      const filepath = path.join(this.outputDir, filename);

      const parser = new Parser();
      const csv = parser.parse(formattedData);

      fs.writeFileSync(filepath, csv);

      return { success: true, filename, filepath };
    } catch (error) {
      console.error('Investment summary export error:', error);
      throw error;
    }
  }

  /**
   * Export Host Earnings Report
   */
  async exportHostEarnings(userId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          i.id as investment_id,
          i.panel_capacity_kw,
          b.full_name as buyer_name,
          ind.company_name as industry_name,
          (i.investment_amount * 0.05 / 12) as monthly_rent,
          i.installation_date,
          t.created_at as payment_date,
          t.amount as rent_received
        FROM investments i
        JOIN users b ON i.buyer_id = b.id
        LEFT JOIN industry_contracts ic ON i.id = ic.investment_id
        LEFT JOIN industries ind ON ic.industry_id = ind.id
        LEFT JOIN transactions t ON t.user_id = $1 AND t.description LIKE '%' || i.id || '%'
        WHERE i.host_id = $1
          AND t.created_at >= $2
          AND t.created_at <= $3
          AND t.transaction_type = 'host_rent'
        ORDER BY t.created_at DESC
      `;

      const result = await db.query(query, [userId, startDate, endDate]);

      if (result.rows.length === 0) {
        return { success: false, message: 'No earnings found' };
      }

      const formattedData = result.rows.map((row) => ({
        'Investment ID': row.investment_id,
        'Capacity (kW)': row.panel_capacity_kw,
        'Buyer': row.buyer_name,
        'Industry': row.industry_name || 'N/A',
        'Monthly Rent (₹)': row.monthly_rent,
        'Payment Date': new Date(row.payment_date).toLocaleDateString(),
        'Amount Received (₹)': row.rent_received,
      }));

      const filename = `host_earnings_${userId}_${Date.now()}.csv`;
      const filepath = path.join(this.outputDir, filename);

      const parser = new Parser();
      const csv = parser.parse(formattedData);

      fs.writeFileSync(filepath, csv);

      return { success: true, filename, filepath };
    } catch (error) {
      console.error('Host earnings export error:', error);
      throw error;
    }
  }
}

module.exports = new ExportService();
