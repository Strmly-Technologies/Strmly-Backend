const router = require('express').Router()
const {
  GlobalSearch,
  PersonalizedSearch,
  GetContentByType,
  GetTopCommunities,
  searchFollowersOrFollowing
} = require('../controller/search.controller')
const { authenticateToken } = require('../middleware/auth')

// API for global search across videos, series, shorts, and users
router.get('/', authenticateToken, GlobalSearch)

// API for personalized search based on user preferences
router.get('/personalized', authenticateToken, PersonalizedSearch)

// API to get content by type (videos, series, shorts)
router.get('/by-type', authenticateToken, GetContentByType)

// API to get the top communities
router.get('/top-communities', authenticateToken, GetTopCommunities)

// API to search for followers or following users
router.get('/search-relations', authenticateToken, searchFollowersOrFollowing)

module.exports = router
