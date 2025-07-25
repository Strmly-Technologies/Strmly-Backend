const router = require('express').Router()
const { authenticateToken } = require('../middleware/auth')
const {
  getCommunityAnalytics,
  getCommunityEngagementStats,
  getCommunityRevenueBreakdown
} = require('../controller/communityAnalytics.controller')

// Get comprehensive community analytics
router.get('/:id', authenticateToken, getCommunityAnalytics)

// Get community engagement statistics
router.get('/:id/engagement', authenticateToken, getCommunityEngagementStats)

// Get community revenue breakdown
router.get('/:id/revenue', authenticateToken, getCommunityRevenueBreakdown)

module.exports = router
