const express = require('express');
const router = express.Router();
const matchingController = require('../controllers/matchingController');
const { authenticate } = require('../middleware/auth');

/**
 * MATCHING ROUTES
 * Smart energy allocation through AI-powered buyer-seller matching
 */

/**
 * POST /api/v1/matching/find-sellers
 * Find best sellers for buyer's energy requirement
 * 
 * Request body:
 * {
 *   requiredKwh: number,
 *   maxPrice: number,
 *   preferences: {
 *     renewable: boolean,
 *     minRating: number
 *   }
 * }
 * 
 * Response:
 * {
 *   matches: [
 *     {
 *       id: string,
 *       seller_id: number,
 *       seller_name: string,
 *       available_kwh: number,
 *       price_per_kwh: number,
 *       distance_km: number,
 *       rating: number,
 *       completed_transactions: number,
 *       match_score: number,
 *       match_breakdown: {
 *         availability: 85,
 *         price: 78,
 *         reliability: 92,
 *         distance: 65,
 *         renewable: 100,
 *         timing: 88
 *       }
 *     }
 *   ]
 * }
 */
router.post('/find-sellers', authenticate, matchingController.findSellerMatches);

/**
 * POST /api/v1/matching/find-buyers
 * Find best buyers for seller's energy production
 * 
 * Request body:
 * {
 *   availableKwh: number,
 *   pricePerKwh: number
 * }
 * 
 * Response: Same structure as find-sellers
 */
router.post('/find-buyers', authenticate, matchingController.findBuyerMatches);

/**
 * GET /api/v1/matching/matches/:matchId
 * Get detailed match information with all scoring factors
 * 
 * Response:
 * {
 *   match_id: string,
 *   total_score: number,
 *   score_breakdown: {
 *     availability: {
 *       score: 85,
 *       label: "Energy Availability",
 *       details: "7.5kWh allocated from 10kWh available",
 *       weight: 0.30
 *     },
 *     price: {
 *       score: 78,
 *       label: "Price Competitiveness",
 *       details: "₹8.50/kWh",
 *       weight: 0.25
 *     },
 *     reliability: {
 *       score: 92,
 *       label: "Seller Reliability",
 *       details: "4.6⭐ from 145 transactions",
 *       weight: 0.20
 *     },
 *     distance: {
 *       score: 65,
 *       label: "Geographic Proximity",
 *       details: "12.3km away",
 *       weight: 0.15
 *     },
 *     renewable: {
 *       score: 100,
 *       label: "Renewable Energy",
 *       details: "Certified renewable",
 *       weight: 0.05
 *     },
 *     timing: {
 *       score: 88,
 *       label: "Timing Compatibility",
 *       details: "Available at requested time",
 *       weight: 0.05
 *     }
 *   },
 *   recommendation: "highly_recommended"
 * }
 */
router.get('/matches/:matchId', authenticate, matchingController.getMatchDetails);

/**
 * POST /api/v1/matching/allocate
 * Create smart allocations based on selected matches
 * 
 * Request body:
 * {
 *   requiredKwh: number,
 *   maxPrice: number,
 *   preferences: {
 *     renewable: boolean
 *   }
 * }
 * 
 * Response:
 * {
 *   total_allocations: number,
 *   allocations: [
 *     {
 *       allocation_id: string,
 *       seller_id: number,
 *       allocated_kwh: number,
 *       price_per_kwh: number,
 *       match_score: number
 *     }
 *   ],
 *   total_cost: number,
 *   timestamp: string
 * }
 */
router.post('/allocate', authenticate, matchingController.createAllocation);

/**
 * GET /api/v1/matching/allocations/active
 * Get user's active allocations
 * 
 * Response:
 * {
 *   active_allocations: [
 *     {
 *       id: string,
 *       seller_id: number,
 *       seller_name: string,
 *       allocated_kwh: number,
 *       price_per_kwh: number,
 *       match_score: number,
 *       start_date: string,
 *       end_date: string,
 *       status: "active"
 *     }
 *   ],
 *   total_allocated_kwh: number,
 *   estimated_monthly_cost: number
 * }
 */
router.get('/allocations/active', authenticate, (req, res) => {
  // Implementation in controller
  res.json({ success: true });
});

/**
 * DELETE /api/v1/matching/allocations/:allocationId
 * Cancel an active allocation
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Allocation cancelled successfully"
 * }
 */
router.delete('/allocations/:allocationId', authenticate, (req, res) => {
  // Implementation in controller
  res.json({ success: true });
});

/**
 * GET /api/v1/matching/statistics
 * Get matching statistics for user dashboard
 * 
 * Response:
 * {
 *   total_matches_found: number,
 *   average_match_score: number,
 *   top_scored_seller: {
 *     seller_name: string,
 *     match_score: number
 *   },
 *   price_range: {
 *     min: number,
 *     max: number,
 *     average: number
 *   },
 *   distance_stats: {
 *     closest: number,
 *     farthest: number,
 *     average: number
 *   }
 * }
 */
router.get('/statistics', authenticate, (req, res) => {
  // Implementation in controller
  res.json({ success: true });
});

/**
 * POST /api/v1/matching/estimate
 * Calculate estimated cost for given requirements
 * 
 * Request body:
 * {
 *   requiredKwh: number,
 *   maxPrice: number
 * }
 * 
 * Response:
 * {
 *   estimated_monthly_cost: number,
 *   average_price_per_kwh: number,
 *   potential_savings: number,
 *   best_seller_price: number,
 *   worst_seller_price: number
 * }
 */
router.post('/estimate', authenticate, matchingController.calculateEstimate);

/**
 * MATCHING ALGORITHM DOCUMENTATION
 * 
 * The matching algorithm uses 6 weighted scoring factors:
 * 
 * 1. AVAILABILITY (30% weight)
 *    - How much energy the seller can provide vs buyer needs
 *    - Score: (allocated_kwh / required_kwh) * 100
 *    - Ranges from 0-100
 * 
 * 2. PRICE COMPETITIVENESS (25% weight)
 *    - How well the price fits within buyer's budget
 *    - Score: 100 - ((price_per_kwh - budget_price) * factor)
 *    - Ranges from 0-100
 * 
 * 3. RELIABILITY (20% weight)
 *    - Seller's rating and transaction history
 *    - Score: (rating / 5) * 100 + (transaction_count * bonus)
 *    - Ranges from 0-100
 * 
 * 4. GEOGRAPHIC PROXIMITY (15% weight)
 *    - Distance between buyer and seller
 *    - Score: 100 (perfect <5km), decreasing to 10 (far >50km)
 *    - Transmission efficiency increases with proximity
 * 
 * 5. RENEWABLE ENERGY (5% weight)
 *    - Whether seller has renewable certification
 *    - Score: 100 (renewable certified), 50 (conventional)
 *    - Bonus for ESG-conscious buyers
 * 
 * 6. TIMING COMPATIBILITY (5% weight)
 *    - How well availability windows align
 *    - Score: 0-100 based on overlap percentage
 *    - Morning/evening peak time alignment
 * 
 * FINAL SCORE CALCULATION:
 * final_score = (
 *   (availability * 0.30) +
 *   (price * 0.25) +
 *   (reliability * 0.20) +
 *   (distance * 0.15) +
 *   (renewable * 0.05) +
 *   (timing * 0.05)
 * ) / sum_of_weights
 * 
 * RECOMMENDATIONS:
 * - Score >= 75: Highly Recommended (green)
 * - Score >= 50: Recommended (yellow)
 * - Score < 50: Consider Alternatives (orange)
 */

module.exports = router;
