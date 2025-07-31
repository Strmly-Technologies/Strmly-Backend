const router = require('express').Router()
const {
  createOrUpdateDraft,
  getUserDrafts,
  getDraftById,
  deleteDraft,
  completeDraftUpload,
  uploadVideoToDraft,
  removeVideoFromDraft,
  getDraftUploadStats,
  cleanupExpiredDrafts,
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

// Upload video to existing draft
router.post(
  '/upload-video/:id',
  authenticateToken,
  generalRateLimiter,
  dynamicVideoUpload,
  uploadVideoToDraft
)

// Remove video from draft
router.delete(
    '/remove-video/:id',
    authenticateToken,
    generalRateLimiter,
    removeVideoFromDraft
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

// Get draft upload statistics
router.get(
    '/stats/upload',
    authenticateToken,
    generalRateLimiter,
    getDraftUploadStats
)

// Admin: Clean up expired drafts
router.delete(
    '/admin/cleanup-expired',
    authenticateToken,
    generalRateLimiter,
    cleanupExpiredDrafts
)


module.exports = router