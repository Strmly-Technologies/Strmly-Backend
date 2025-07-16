const router = require('express').Router()
const {
  DeleteLongVideo,

  DeleteUserProfile,
  DeleteCommunity,
  DeleteSeries,
  RemoveVideoFromCommunity,
  UnfollowCommunity,
  RemoveUserFromCommunity,
  BulkDeleteVideos,
} = require('../controller/caution.controller')
const { authenticateToken } = require('../middleware/auth')

// API to delete a long video
router.delete('/video/long/:videoId', authenticateToken, DeleteLongVideo)

// API to bulk delete videos
router.delete('/videos/bulk', authenticateToken, BulkDeleteVideos)

// API to delete user profile
router.delete('/profile', authenticateToken, DeleteUserProfile)

// API to delete a community
router.delete('/community/:communityId', authenticateToken, DeleteCommunity)

// API to delete a series
router.delete('/series/:seriesId', authenticateToken, DeleteSeries)

// API to remove a video from a community
router.patch(
  '/community/remove-video',
  authenticateToken,
  RemoveVideoFromCommunity
)

// API to unfollow a community
router.patch('/community/unfollow', authenticateToken, UnfollowCommunity)

// API to remove a user from a community
router.patch(
  '/community/remove-user',
  authenticateToken,
  RemoveUserFromCommunity
)

module.exports = router
