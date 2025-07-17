const router = require('express').Router()
const { authenticateToken } = require('../middleware/auth')
const {
  getPersonalizedVideoRecommendations,
  addUserInterest,
  removeUserInterest,
  markVideoAsViewed,
  resetViewedVideos,
  getUserRecommendationStats,
} = require('../controller/recommendation.controller')

// Get personalized video recommendations
router.get('/videos', authenticateToken, getPersonalizedVideoRecommendations)

// Add interest to user profile
router.post('/interests', authenticateToken, addUserInterest)

// Remove interest from user profile
router.delete('/interests', authenticateToken, removeUserInterest)

// Mark video as viewed
router.post('/viewed', authenticateToken, markVideoAsViewed)

// Reset viewed videos history
router.post('/reset-viewed', authenticateToken, resetViewedVideos)

// Get recommendation statistics
router.get('/stats', authenticateToken, getUserRecommendationStats)

module.exports = router
