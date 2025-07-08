const router = require('express').Router()
const {
  uploadVideo,
  searchVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  getTrendingVideos,
  getVideosByGenre,
  incrementVideoView,
  getRelatedVideos,
  uploadVideoToCommunity,
} = require('../controller/video.controller')
const { dynamicVideoUpload, handleMulterError } = require('../utils/utils')
const { authenticateToken } = require('../middleware/auth')

// Route to upload a new video
router.post(
  '/upload',
  authenticateToken,
  dynamicVideoUpload,
  uploadVideo,
  handleMulterError
)

// Route to search for videos with pagination
router.get('/search', searchVideos)

// Route to get trending videos
router.get('/trending', getTrendingVideos)

// Route to get videos by genre
router.get('/by-genre/:genre', getVideosByGenre)

// Route to get a video by ID
router.get('/:id', getVideoById)

// Route to update a video by ID
router.put('/:id', authenticateToken, updateVideo)

// Route to delete a video by ID
router.delete('/:id', authenticateToken, deleteVideo)

// Route to increment video view count
router.post('/:id/view', authenticateToken, incrementVideoView)

// Route to get related videos by video ID
router.get('/:id/related', getRelatedVideos)

//add video to community
router.post('/upload/community',authenticateToken, uploadVideoToCommunity)

module.exports = router
