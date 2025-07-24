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
  createVideoABSSegments,
  getVideoABSSegments,
  uploadVideoChunks,
  finaliseChunkUpload,
} = require('../controller/video.controller')
const {
  checkVideoAccess,
  streamVideo,
  purchaseIndividualVideo,
} = require('../controller/videoAccess.controller')
const {
  dynamicVideoUpload,
  handleMulterError,
  validateVideoFormData,
} = require('../utils/utils')
const { authenticateToken } = require('../middleware/auth')

// Route to upload a new video
//videoFile needed
//accepts: FormData(name, description, genre, type, language, age_restriction, communityId, seriesId, videoFile)
router.post(
  '/upload',
  authenticateToken,
  dynamicVideoUpload,
  validateVideoFormData,
  uploadVideo,
  handleMulterError
)
// Routes to upload a new video as chunk
// videoFile needed
//accepts: FormData( fileId, chunkIndex, totalChunks,originalname,mimetype) -- chunkIndex: starts from 1
router.post(
  '/upload-chunks',
  authenticateToken,
  dynamicVideoUpload,
  validateVideoFormData,
  uploadVideoChunks
)
//accepts: req.body(fileId, totalChunks,originalname,mimetype,name, description, genre, type, language, age_restriction, communityId, seriesId, videoFile) -- chunkIndex: starts from 1
router.post('/finalise-chunk-upload', authenticateToken, finaliseChunkUpload)

//Route to create video segments for different quality for Adaptive Bitrate Streaming
//accepts: videoId
router.post('/create-segments', authenticateToken, createVideoABSSegments)

//Route to get the video segments' .m3u8 files' s3 url
router.get('/get-segments', authenticateToken, getVideoABSSegments)

// Route to search for videos with pagination
router.get('/search', searchVideos)

// Route to get trending videos
router.get('/trending', getTrendingVideos)

//add video to community
router.post('/upload/community', authenticateToken, uploadVideoToCommunity)

// Route to get videos by genre
router.get('/by-genre/:genre', getVideosByGenre)

// Route to increment video view count
router.post('/:id/view', authenticateToken, incrementVideoView)

// Route to get related videos by video ID
router.get('/:id/related', getRelatedVideos)

// Video access control routes
router.get('/:id/access-check', authenticateToken, checkVideoAccess)

router.get('/:id/stream', authenticateToken, streamVideo)

router.post('/:id/purchase', authenticateToken, purchaseIndividualVideo)

// Route to get a video by ID
router.get('/:id', getVideoById)

// Route to update a video by ID
router.put('/:id', authenticateToken, updateVideo)

// Route to delete a video by ID
router.delete('/:id', authenticateToken, deleteVideo)

module.exports = router
