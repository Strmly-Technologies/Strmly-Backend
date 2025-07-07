const router = require('express').Router()
const {
  FollowCommunity,
  CreateCommunity,
  RenameCommunity,
  ChangeCommunityProfilePhoto,
  AddBioToCommunity,
  getAllCommunities,
  getCommunityById,
  getUserJoinedCommunities,
  getUserCreatedCommunities,
  getUploadPermissionForCommunity,
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
router.get('/all', authenticateToken , getAllCommunities)

// API to get community by ID
router.get('/:id', authenticateToken, getCommunityById)

// API to get communities user is part of
router.get('/user/communities', authenticateToken, getUserJoinedCommunities)

// API to get communities created by user
router.get('/user/created-communities', authenticateToken, getUserCreatedCommunities)

// API to get upload permission for a community
router.post('/upload-permission', authenticateToken, getUploadPermissionForCommunity)

module.exports = router
