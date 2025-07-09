const router = require('express').Router()
const {
  LikeVideo,
  ShareVideo,
  CommentOnVideo,
  GiftComment,
  GiftShortVideo,
} = require('../controller/interaction.controller')
const { authenticateToken } = require('../middleware/auth')
const {
  generalRateLimiter,
  paymentRateLimiter,
} = require('../middleware/rateLimiter')

// API to like a video
router.post('/like', authenticateToken, generalRateLimiter, LikeVideo)

// API to share a video
router.post('/share', authenticateToken, generalRateLimiter, ShareVideo)

// API to comment on a video
router.post('/comment', authenticateToken, generalRateLimiter, CommentOnVideo)

// API to gift a comment
router.post('/gift-comment', authenticateToken, paymentRateLimiter, GiftComment)

// Gift short video to creator
router.post('/gift-short-video', authenticateToken, GiftShortVideo)

module.exports = router
