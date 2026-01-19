/**
 * PDF Certificate Generation Service
 * Generates energy certificates, carbon offset reports, investment certificates
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class CertificateService {
  constructor() {
    this.outputDir = path.join(__dirname, '../../generated/certificates');
    this._ensureDirectoryExists();
  }

  _ensureDirectoryExists() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate Energy Certificate for Industry
   */
  async generateEnergyCertificate(industryData, consumptionData) {
    return new Promise((resolve, reject) => {
      const filename = `energy_certificate_${industryData.id}_${Date.now()}.pdf`;
      const filepath = path.join(this.outputDir, filename);

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Header
      doc
        .fontSize(24)
        .fillColor('#4CAF50')
        .text('Solar Energy Certificate', { align: 'center' })
        .moveDown();

      doc
        .fontSize(10)
        .fillColor('#666')
        .text(`Certificate No: EC-${Date.now()}`, { align: 'center' })
        .text(`Issue Date: ${new Date().toLocaleDateString()}`, { align: 'center' })
        .moveDown(2);

      // Decorative line
      doc
        .strokeColor('#4CAF50')
        .lineWidth(2)
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke()
        .moveDown();

      // Company Info
      doc
        .fontSize(14)
        .fillColor('#333')
        .text('This certifies that', { align: 'center' })
        .moveDown(0.5);

      doc
        .fontSize(18)
        .fillColor('#2196F3')
        .font('Helvetica-Bold')
        .text(industryData.company_name, { align: 'center' })
        .moveDown();

      doc
        .fontSize(12)
        .fillColor('#333')
        .font('Helvetica')
        .text(`${industryData.city}, ${industryData.state}`, { align: 'center' })
        .moveDown(2);

      // Consumption Details
      doc
        .fontSize(14)
        .fillColor('#333')
        .font('Helvetica-Bold')
        .text('Energy Consumption Details')
        .moveDown();

      const details = [
        ['Total Energy Consumed:', `${consumptionData.total_kwh.toLocaleString()} kWh`],
        ['Energy Source:', 'Solar (Renewable)'],
        ['Period:', consumptionData.period],
        ['Carbon Offset:', `${(consumptionData.carbon_offset_kg / 1000).toFixed(2)} Tons CO₂`],
        [
          'Equivalent Trees Planted:',
          `${Math.floor(consumptionData.carbon_offset_kg / 20)} Trees`,
        ],
      ];

      let yPosition = doc.y;
      details.forEach(([label, value]) => {
        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#666')
          .text(label, 70, yPosition, { continued: true, width: 250 });

        doc
          .font('Helvetica-Bold')
          .fillColor('#333')
          .text(value, { align: 'right', width: 450 });

        yPosition += 25;
      });

      doc.moveDown(3);

      // Certification Statement
      doc
        .fontSize(11)
        .fillColor('#666')
        .font('Helvetica')
        .text(
          'This certificate confirms that the above-mentioned energy consumption was sourced from solar renewable energy, contributing to environmental sustainability and carbon emission reduction.',
          { align: 'justify' }
        )
        .moveDown(2);

      // Footer with seal
      doc
        .fontSize(10)
        .fillColor('#999')
        .text('Solar Sharing Platform', { align: 'center' })
        .text('Certified Renewable Energy Provider', { align: 'center' })
        .moveDown();

      doc
        .fontSize(8)
        .text(`Generated on: ${new Date().toISOString()}`, { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        resolve({ filename, filepath });
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Generate Carbon Offset Report
   */
  async generateCarbonOffsetReport(userData, carbonData) {
    return new Promise((resolve, reject) => {
      const filename = `carbon_report_${userData.id}_${Date.now()}.pdf`;
      const filepath = path.join(this.outputDir, filename);

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Header
      doc
        .fontSize(24)
        .fillColor('#4CAF50')
        .text('Carbon Offset Report', { align: 'center' })
        .moveDown(2);

      // User Info
      doc
        .fontSize(14)
        .fillColor('#333')
        .font('Helvetica-Bold')
        .text(`${userData.full_name}`)
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#666')
        .text(`User ID: ${userData.id}`)
        .text(`Report Date: ${new Date().toLocaleDateString()}`)
        .moveDown(2);

      // Summary Box
      doc
        .rect(50, doc.y, 500, 100)
        .fillAndStroke('#E8F5E9', '#4CAF50')
        .fillColor('#333');

      const boxY = doc.y + 20;
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Total Carbon Offset', 70, boxY)
        .fontSize(32)
        .fillColor('#4CAF50')
        .text(`${(carbonData.total_kg / 1000).toFixed(2)} Tons`, 70, boxY + 30);

      doc.moveDown(8);

      // Breakdown
      doc
        .fontSize(14)
        .fillColor('#333')
        .font('Helvetica-Bold')
        .text('Environmental Impact Breakdown')
        .moveDown();

      const impacts = [
        ['CO₂ Prevented:', `${carbonData.total_kg.toLocaleString()} kg`],
        ['Equivalent Trees:', `${Math.floor(carbonData.total_kg / 20)} trees`],
        ['Miles Not Driven:', `${Math.floor(carbonData.total_kg * 2.5)} miles`],
        ['Coal Not Burned:', `${(carbonData.total_kg / 453.6).toFixed(2)} lbs`],
      ];

      impacts.forEach(([label, value]) => {
        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#666')
          .text(label, { continued: true });

        doc.font('Helvetica-Bold').fillColor('#4CAF50').text(` ${value}`);
      });

      doc.end();

      stream.on('finish', () => {
        resolve({ filename, filepath });
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Generate Investment Certificate
   */
  async generateInvestmentCertificate(investmentData) {
    return new Promise((resolve, reject) => {
      const filename = `investment_certificate_${investmentData.id}_${Date.now()}.pdf`;
      const filepath = path.join(this.outputDir, filename);

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Header
      doc
        .fontSize(24)
        .fillColor('#2196F3')
        .text('Solar Investment Certificate', { align: 'center' })
        .moveDown();

      doc
        .fontSize(10)
        .fillColor('#666')
        .text(`Certificate No: INV-${investmentData.id}`, { align: 'center' })
        .text(`Issue Date: ${new Date().toLocaleDateString()}`, { align: 'center' })
        .moveDown(2);

      // Investment Details
      doc
        .fontSize(14)
        .fillColor('#333')
        .text('This certifies that', { align: 'center' })
        .moveDown();

      doc
        .fontSize(18)
        .fillColor('#2196F3')
        .font('Helvetica-Bold')
        .text(investmentData.buyer_name, { align: 'center' })
        .moveDown();

      doc
        .fontSize(12)
        .fillColor('#333')
        .font('Helvetica')
        .text('has successfully invested in', { align: 'center' })
        .moveDown(2);

      // Panel Details
      doc
        .rect(50, doc.y, 500, 80)
        .fillAndStroke('#E3F2FD', '#2196F3')
        .fillColor('#333');

      const panelY = doc.y + 15;
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`${investmentData.panel_capacity_kw} kW Solar Panel Installation`, 70, panelY)
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#666')
        .text(`Investment Amount: ₹${investmentData.investment_amount.toLocaleString()}`, 70, panelY + 25)
        .text(
          `Location: ${investmentData.host_location}`,
          70,
          panelY + 45
        );

      doc.moveDown(7);

      // Terms
      doc
        .fontSize(11)
        .fillColor('#666')
        .text('Terms & Conditions:', { underline: true })
        .moveDown(0.5);

      const terms = [
        `Installation Date: ${new Date(investmentData.installation_date).toLocaleDateString()}`,
        `Expected Monthly Production: ${investmentData.monthly_production_kwh} kWh`,
        `Expected ROI: ${investmentData.roi_percentage}% per annum`,
        'Warranty: 25 years on solar panels',
        'Maintenance: Included for first 5 years',
      ];

      terms.forEach((term) => {
        doc.fontSize(10).fillColor('#666').text(`• ${term}`);
      });

      doc.end();

      stream.on('finish', () => {
        resolve({ filename, filepath });
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }
}

module.exports = new CertificateService();
