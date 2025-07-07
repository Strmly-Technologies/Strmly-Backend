const router = require('express').Router()
const {
  getShortVideosFeed,
  getShortVideoById,
  updateShortVideo,
  deleteShortVideo,
  getTrendingShorts,
} = require('../controller/shorts.controller')
const { authenticateToken } = require('../middleware/auth')

// Route to get the feed of short videos
router.get('/feed', getShortVideosFeed)

// Route to get trending short videos
router.get('/trending', getTrendingShorts)

// Route to get a short video by ID
router.get('/:id', getShortVideoById)

// Route to update a short video by ID
router.put('/:id', authenticateToken, updateShortVideo)

// Route to delete a short video by ID
router.delete('/:id', authenticateToken, deleteShortVideo)

module.exports = router
