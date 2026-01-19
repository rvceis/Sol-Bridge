const matchingService = require('../services/MatchingService');
const { asyncHandler } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Find best sellers for buyer's energy requirement
 * Shows matching algorithm breakdown
 */
const findSellerMatches = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { requiredKwh, maxPrice, preferences = {} } = req.body;

  if (!requiredKwh || !maxPrice) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'requiredKwh and maxPrice are required',
    });
  }

  // Get buyer location from database
  const buyerResult = await db.query(
    `SELECT latitude, longitude, city, state FROM buyers WHERE user_id = $1`,
    [userId]
  );

  if (buyerResult.rows.length === 0) {
    return res.status(404).json({
      error: 'NotFoundError',
      message: 'Buyer profile not found',
    });
  }

  const buyer = buyerResult.rows[0];
  const buyerLocation = {
    latitude: buyer.latitude,
    longitude: buyer.longitude,
    city: buyer.city,
    state: buyer.state,
  };

  // Get matches from ML service
  const matches = await matchingService.findSellerMatches(
    userId,
    requiredKwh,
    maxPrice,
    buyerLocation,
    preferences
  );

  res.json({
    success: true,
    data: {
      ...matches,
      buyer_requirements: {
        required_kwh: requiredKwh,
        max_price_per_kwh: maxPrice,
        renewable_preference: preferences.renewable || false,
        min_rating: preferences.minRating || 3.0,
      },
    },
  });
});

/**
 * Get match details with breakdown
 * Shows all variables that affected the score
 */
const getMatchDetails = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { matchId } = req.params;

  // Get match details with all scoring factors
  const result = await db.query(
    `SELECT 
       sa.id,
       sa.buyer_id,
       sa.seller_id,
       sa.allocated_kwh,
       sa.price_per_kwh,
       sa.match_score,
       sa.created_at,
       l.distance_km,
       l.energy_amount_kwh,
       u.average_rating,
       u.completed_transactions,
       h.renewable_cert
     FROM smart_allocations sa
     JOIN listings l ON sa.seller_id = l.seller_id
     JOIN users u ON sa.seller_id = u.id
     JOIN hosts h ON sa.seller_id = h.user_id
     WHERE sa.id = $1 AND sa.buyer_id = $2`,
    [matchId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: 'NotFoundError',
      message: 'Match not found',
    });
  }

  const match = result.rows[0];

  // Calculate individual scores
  const availabilityScore = (match.allocated_kwh / match.energy_amount_kwh) * 100;
  const priceScore = Math.max(0, 100 - ((match.price_per_kwh - 8) * 5));
  const reliabilityScore = (match.average_rating / 5) * 100 + (match.completed_transactions * 0.5);
  const distanceScore = Math.max(10, 100 - (match.distance_km * 1.5));

  res.json({
    success: true,
    data: {
      match_id: match.id,
      total_score: match.match_score,
      score_breakdown: {
        availability: {
          score: Math.round(availabilityScore),
          label: 'Energy Availability',
          details: `${match.allocated_kwh}kWh allocated from ${match.energy_amount_kwh}kWh available`,
          weight: 0.30,
        },
        price: {
          score: Math.round(priceScore),
          label: 'Price Competitiveness',
          details: `₹${match.price_per_kwh}/kWh`,
          weight: 0.25,
        },
        reliability: {
          score: Math.round(reliabilityScore),
          label: 'Seller Reliability',
          details: `${match.average_rating}⭐ from ${match.completed_transactions} transactions`,
          weight: 0.20,
        },
        distance: {
          score: Math.round(distanceScore),
          label: 'Geographic Proximity',
          details: `${match.distance_km}km away`,
          weight: 0.15,
        },
        renewable: {
          score: match.renewable_cert ? 100 : 50,
          label: 'Renewable Energy',
          details: match.renewable_cert ? 'Certified renewable' : 'Conventional',
          weight: 0.05,
        },
        timing: {
          score: 80,
          label: 'Timing Compatibility',
          details: 'Available at requested time',
          weight: 0.05,
        },
      },
      recommendation: match.match_score >= 75 ? 'highly_recommended' : 
                      match.match_score >= 50 ? 'recommended' : 'consider_alternatives',
    },
  });
});

/**
 * Create smart allocation based on matches
 */
const createAllocation = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { requiredKwh, maxPrice, preferences = {} } = req.body;

  // Find matches
  const matches = await matchingService.findSellerMatches(
    userId,
    requiredKwh,
    maxPrice,
    preferences
  );

  if (!matches.matches || matches.matches.length === 0) {
    return res.status(400).json({
      error: 'NoMatches',
      message: 'No suitable sellers found for your requirements',
    });
  }

  // Create allocations
  const allocations = await matchingService.createSmartAllocation(
    userId,
    matches.matches
  );

  res.json({
    success: true,
    data: {
      total_allocations: allocations.length,
      allocations: allocations,
      total_cost: matches.matches.reduce((sum, m) => 
        sum + (m.match_breakdown.price_per_kwh * m.total_available), 0
      ),
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = {
  findSellerMatches,
  getMatchDetails,
  createAllocation,
};
