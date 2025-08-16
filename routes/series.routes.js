const router = require('express').Router()
const {
  createSeries,
  getSeriesById,
  updateSeries,
  deleteSeries,
  addEpisodeToSeries,
  removeEpisodeFromSeries,
  searchSeries,
  getAllSeries,
  getUserSeries,
  unlockFunds,
} = require('../controller/series.controller')
const { authenticateToken } = require('../middleware/auth')

// Route to get all series created by a user
router.get('/user', authenticateToken, getUserSeries)

// Route to create a new series
router.post('/create', authenticateToken, createSeries)

// Route to search for series with pagination
router.get('/search', authenticateToken, searchSeries)

// Route to get all series with pagination
router.get('/all', authenticateToken, getAllSeries)

// Route to unlock funds
router.post('/unlock-funds', authenticateToken, unlockFunds)

// Route to remove an episode from a series
router.delete(
  '/:seriesId/episodes/:episodeId',
  authenticateToken,
  removeEpisodeFromSeries
)

// Route to add an episode to a series
router.post('/:id/episodes', authenticateToken, addEpisodeToSeries)

// Route to get a series by ID
router.get('/:id', authenticateToken, getSeriesById)

// Route to update a series by ID
router.put('/:id', authenticateToken, updateSeries)

// Route to delete a series by ID
router.delete('/:id', authenticateToken, deleteSeries)

module.exports = router
