const router = require('express').Router()
const {
  createOrUpdateDraft,
  getUserDrafts,
  getDraftById,
  deleteDraft,
  completeDraftUpload,
} = require('../controller/draft.controller')

const { authenticateToken } = require('../middleware/auth')
const { generalRateLimiter } = require('../middleware/rateLimiter')
const { dynamicVideoUpload } = require('../utils/utils')


// Create or update draft (metadata only, no video file)
router.post(
  '/create-or-update',
  authenticateToken,
  generalRateLimiter,
  createOrUpdateDraft
)

router.get(
    '/all',
    authenticateToken,
    generalRateLimiter,
    getUserDrafts
)

router.get(
    '/:id',
    authenticateToken,
    generalRateLimiter,
    getDraftById
)

router.delete(
    '/:id',
    authenticateToken,
    generalRateLimiter,
    deleteDraft
)

router.post(
    '/complete/:id',
    authenticateToken,
    generalRateLimiter,
    dynamicVideoUpload,
    completeDraftUpload,
)


module.exports = router