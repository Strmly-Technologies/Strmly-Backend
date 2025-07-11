const router = require('express').Router()
const {
  FollowCommunity,
  CreateCommunity,
  RenameCommunity,
  ChangeCommunityProfilePhoto,
  AddBioToCommunity,
  getAllCommunities,
  getCommunityById,
  getUploadPermissionForCommunity,
  getCommunityProfileDetails,
  getTrendingCommunityVideos,
  getTrendingVideosByCommunity,
  getCommunityVideos,
  getUserCommunities
} = require('../controller/community.controller')
const { authenticateToken } = require('../middleware/auth')

// API to create a community
router.post('/create', authenticateToken, CreateCommunity)

// API to rename a community
router.put('/rename', authenticateToken, RenameCommunity)

// API to change community profile photo
router.put(
  '/change-profile-photo',
  authenticateToken,
  ChangeCommunityProfilePhoto
)

// API to follow a community
router.post('/follow', authenticateToken, FollowCommunity)

// API to add bio to a community
router.put('/add-bio', authenticateToken, AddBioToCommunity)

// API to get all communities
router.get('/all', authenticateToken, getAllCommunities)

// API to get user communities
router.get('/my-communities', authenticateToken, getUserCommunities)

// API to get upload permission for a community
router.post(
  '/upload-permission',
  authenticateToken,
  getUploadPermissionForCommunity
)

// Get trending videos from all communities
router.get('/trending-videos', getTrendingCommunityVideos)

// API to get community profile details
router.get('/profile/:id', authenticateToken, getCommunityProfileDetails)

//API to get community videos
router.get('/:id/videos', authenticateToken, getCommunityVideos)

// Get trending videos from a specific community
router.get('/:id/trending-videos', getTrendingVideosByCommunity)

// API to get community by ID
router.get('/:id', authenticateToken, getCommunityById)

module.exports = router
