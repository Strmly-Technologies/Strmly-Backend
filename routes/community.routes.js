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
  getUserCommunities,
  getListOfCreators,
  changeCommunityFounder,
  makeFirstJoinedCreatorFounder,
  getCommunityFollowingStatus,
  UpdateCommunitySettingsAccess,
} = require('../controller/community.controller')

const {
  communityProfilePhotoUpload,
  validateCommunityProfilePhotoFormData,
} = require('../utils/utils')

const { authenticateToken } = require('../middleware/auth')

// API to create a community
router.post('/create', authenticateToken,communityProfilePhotoUpload,CreateCommunity)

router.post('/update-settings',authenticateToken, UpdateCommunitySettingsAccess)

// API to rename a community
router.put('/rename', authenticateToken, RenameCommunity)

// API to change community profile photo
//accepts: FormData(communityId, imageFile)
router.put(
  '/change-profile-photo',
  authenticateToken,
  communityProfilePhotoUpload,
  validateCommunityProfilePhotoFormData,
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

router.get('/creators/:communityId', authenticateToken, getListOfCreators)

// API to change community founder
router.post('/change-founder', authenticateToken, changeCommunityFounder)

// API to make the first joined creator the founder
router.post(
  '/make-first-founder',
  authenticateToken,
  makeFirstJoinedCreatorFounder
)
// API to get community profile details
router.get('/profile/:id', authenticateToken, getCommunityProfileDetails)

// API to get community following status
router.post(
  '/:id/following-status',
  authenticateToken,
  getCommunityFollowingStatus
)

//API to get community videos
router.get('/:id/videos', authenticateToken, getCommunityVideos)

// Get trending videos from a specific community
router.get('/:id/trending-videos', getTrendingVideosByCommunity)

// API to get community by ID
router.get('/:id', authenticateToken, getCommunityById)
module.exports = router
