const router = require('express').Router()
const {
  LikeVideo,
  ShareVideo,
  CommentOnVideo,
  GiftComment,
  GiftShortVideo,
  getVideoComments,
  getCommentReplies,
  upvoteComment,
  downvoteComment,
  statusOfLike,
  saveVideo,
  getTotalSharesByVideoId
} = require('../controller/interaction.controller')
const { authenticateToken } = require('../middleware/auth')
const {
  generalRateLimiter,
  paymentRateLimiter,
} = require('../middleware/rateLimiter')

// API to like/unlike a video (toggle functionality)
router.post('/like', authenticateToken, generalRateLimiter, LikeVideo)

// API to unlike a video (same as like - it toggles)
router.post('/unlike', authenticateToken, generalRateLimiter, LikeVideo)

// API to share a video
router.post('/share', authenticateToken, generalRateLimiter, ShareVideo)

// API to comment on a video
router.post('/comment', authenticateToken, generalRateLimiter, CommentOnVideo)

// Get video comments - Updated route
router.get('/videos/:videoId/comments', authenticateToken, generalRateLimiter, getVideoComments);

// Get comment replies - New route
router.get('/videos/:videoId/comments/:commentId/replies', authenticateToken, generalRateLimiter, getCommentReplies);

// Upvote/Downvote comments
router.post('/comments/upvote', authenticateToken, generalRateLimiter, upvoteComment);
router.post('/comments/downvote', authenticateToken, generalRateLimiter, downvoteComment);

// API to gift a comment
router.post('/gift-comment', authenticateToken, paymentRateLimiter, GiftComment)

// Gift short video to creator
router.post('/gift-short-video', authenticateToken, paymentRateLimiter, GiftShortVideo)

// API to save a video/series
router.post('/save', authenticateToken, generalRateLimiter, saveVideo)

// get status of like video
router.post('/like/status', authenticateToken, generalRateLimiter, statusOfLike)

// Get total shares by video ID
router.get('/shares/:videoId', authenticateToken, generalRateLimiter, getTotalSharesByVideoId)

module.exports = router
