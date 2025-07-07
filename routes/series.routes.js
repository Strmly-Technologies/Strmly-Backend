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
} = require('../controller/series.controller')
const { authenticateToken } = require('../middleware/auth')

// Route to create a new series
router.post('/create', authenticateToken, createSeries)

// Route to search for series with pagination
router.get('/search', searchSeries)

// Route to get all series with pagination
router.get('/all', getAllSeries)

// Route to get a series by ID
router.get('/:id', getSeriesById)

// Route to update a series by ID
router.put('/:id', authenticateToken, updateSeries)

// Route to delete a series by ID
router.delete('/:id', authenticateToken, deleteSeries)

// Route to add an episode to a series
router.post('/:id/episodes', authenticateToken, addEpisodeToSeries)

// Route to remove an episode from a series
router.delete(
  '/:seriesId/episodes/:episodeId',
  authenticateToken,
  removeEpisodeFromSeries
)

module.exports = router
