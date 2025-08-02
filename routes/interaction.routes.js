const router = require('express').Router()
const {
  LikeVideo,
  ShareVideo,
  CommentOnVideo,
  GiftComment,
  getVideoComments,
  getCommentReplies,
  upvoteComment,
  downvoteComment,
  statusOfLike,
  reshareVideo,
  getTotalSharesByVideoId,
  checkForSaveVideo,
  UnsaveVideo,
  ReplyToComment,
  UpvoteReply,
  DownvoteReply,
  deleteComment,
  statusOfUserFollowing,
  statusOfReshare,
  statusOfUserFollower,
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
router.get(
  '/videos/:videoId/comments',
  authenticateToken,
  generalRateLimiter,
  getVideoComments
)

// Get comment replies - New route
router.get(
  '/videos/:videoId/comments/:commentId/replies',
  authenticateToken,
  generalRateLimiter,
  getCommentReplies
)

//API to reply to a comment
router.post(
  '/comments/reply',
  authenticateToken,
  generalRateLimiter,
  ReplyToComment
)

// Upvote/Downvote comments
router.post(
  '/comments/upvote',
  authenticateToken,
  generalRateLimiter,
  upvoteComment
)
router.post(
  '/comments/downvote',
  authenticateToken,
  generalRateLimiter,
  downvoteComment
)

// Upvote/Downvote replies
router.post(
  '/replies/upvote',
  authenticateToken,
  generalRateLimiter,
  UpvoteReply
)
router.post(
  '/replies/downvote',
  authenticateToken,
  generalRateLimiter,
  DownvoteReply
)

//delete comment/reply
router.delete(
  '/comments/delete',
  authenticateToken,
  generalRateLimiter,
  deleteComment
)

// API to gift a comment
router.post('/gift-comment', authenticateToken, paymentRateLimiter, GiftComment)

// API to reshare a video
router.post('/reshare', authenticateToken, generalRateLimiter, reshareVideo)

// API to unsave a video/series
router.post('/unsave', authenticateToken, generalRateLimiter, UnsaveVideo)

//check if video is saved
router.post('/saved/status', authenticateToken, checkForSaveVideo)

// get status of like video
router.post('/like/status', authenticateToken, generalRateLimiter, statusOfLike)

// get status of reshare video
router.post(
  '/reshare/status',
  authenticateToken,
  generalRateLimiter,
  statusOfReshare
)

// get status of user follower
router.post(
  '/follower/status',
  authenticateToken,
  generalRateLimiter,
  statusOfUserFollower
)

// get status of user following
router.post(
  '/following/status',
  authenticateToken,
  generalRateLimiter,
  statusOfUserFollowing
)

// Get total shares by video ID
router.get(
  '/shares/:videoId',
  authenticateToken,
  generalRateLimiter,
  getTotalSharesByVideoId
)

module.exports = router
