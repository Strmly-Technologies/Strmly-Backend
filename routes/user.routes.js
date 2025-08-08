const router = require('express').Router()
const { authenticateToken } = require('../middleware/auth')
const {
  GetUserFeed,
  GetUserProfile,
  UpdateUserProfile,
  GetUserCommunities,
  GetUserVideos,
  GetUserInteractions,
  GetUserEarnings,
  GetUserNotifications,
  UpdateUserInterests,
  GetUserFollowers,
  GetUserFollowing,
  getUserProfileDetails,
  GetUserProfileById,
  GetUserVideosById,
  SetCreatorPassPrice,
  HasCreatorPass,
  followUser,
  unfollowUser,
  getUserHistory,
  getUserLikedVideosInCommunity,
  updateSocialMediaLinks,
  getUserDashboardAnalytics,
  getUserPurchasedAccess,
  toggleCommentMonetization,
  saveUserFCMToken,
  GetStatusOfReshare,
  AddVideoToUserViewHistory,
  getUserReshares,
  getUserInterests,
  getMonetizationStatus,
  toggleVideoMonetization,
  getResharesOfOtherUser,
} = require('../controller/user.controller')
const { createImageMulter, handleMulterError } = require('../utils/utils')

// Get user feed
router.get('/feed', authenticateToken, GetUserFeed)

// Get user profile
router.get('/profile', authenticateToken, GetUserProfile)

// Update user profile
router.put(
  '/profile',
  authenticateToken,
  createImageMulter().single('profile_photo'),
  UpdateUserProfile,
  handleMulterError
)

router.get('/dashboard', authenticateToken, getUserDashboardAnalytics)

//gets the videos, series and creator pass data which the user has purchased
router.get('/purchased-access', authenticateToken, getUserPurchasedAccess)

//enable/disable comment monetization
router.put(
  '/toggle-comment-monetization',
  authenticateToken,
  toggleCommentMonetization
)

//enable/disable video monetization
router.put(
  '/toggle-video-monetization',
  authenticateToken,
  toggleVideoMonetization
)

//get comment and video monetization status
router.get('/monetization-status', authenticateToken, getMonetizationStatus)

//send firebase FCM token for the user
router.post('/fcm_token', authenticateToken, saveUserFCMToken)

// Get user communities
router.get('/communities', authenticateToken, GetUserCommunities)

// Get user videos

// Get user interactions
router.get('/interactions', authenticateToken, GetUserInteractions)

// Get user earnings
router.get('/earnings', authenticateToken, GetUserEarnings)

// Get user notifications
router.get('/notifications', authenticateToken, GetUserNotifications)

// Update user interests
router.put('/interests', authenticateToken, UpdateUserInterests)

// Get user interests
router.get('/interests', authenticateToken, getUserInterests)

// Get all user followers
router.get('/followers', authenticateToken, GetUserFollowers)

// Get all user following
router.get('/following', authenticateToken, GetUserFollowing)

// Get user profile details
router.get('/profile-details', authenticateToken, getUserProfileDetails)

// follow a user
router.post('/follow', authenticateToken, followUser)

// unfollow a user
router.post('/unfollow', authenticateToken, unfollowUser)

// Get user history
router.get('/history', authenticateToken, getUserHistory)

//get user reshared videos
router.get('/reshares', authenticateToken, getUserReshares)



router.post('/reshare/status', authenticateToken, GetStatusOfReshare)

// Get user liked videos in a community
router.get(
  '/liked-videos-community',
  authenticateToken,
  getUserLikedVideosInCommunity
)

// Update social media links
router.put('/social-media-links', authenticateToken, updateSocialMediaLinks)

// Add video to user view history
router.post('/history', authenticateToken, AddVideoToUserViewHistory)

router.get('/videos', authenticateToken, GetUserVideos)

// Set creator pass price
router.put('/creator-pass-price', authenticateToken, SetCreatorPassPrice)

// Check creator pass deletion status
router.get(
  '/creator-pass-deletion-status',
  authenticateToken,
  (req, res, next) => {
    // Redirect to creator pass routes
    req.url = '/deletion-status'
    next()
  }
)
// Get user profile by ID
router.get('/profile/:id', authenticateToken, GetUserProfileById)

// Get user videos by ID
router.get('/videos/:id', authenticateToken, GetUserVideosById)

// Check if user has creator pass for specific creator
router.get('/has-creator-pass/:creatorId', authenticateToken, HasCreatorPass)

router.get('/reshares/:id', authenticateToken, getResharesOfOtherUser)

module.exports = router
