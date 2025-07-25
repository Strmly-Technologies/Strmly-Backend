const router = require('express').Router()
const { authenticateToken } = require('../middleware/auth')
const {
  getSeriesAnalytics
} = require('../controller/seriesAnalytics.controller')

// Get comprehensive series analytics (creator only)
router.get('/:id', authenticateToken, getSeriesAnalytics)



module.exports = router
