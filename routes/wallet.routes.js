const router = require('express').Router()
const {
  getWalletDetails,
  createWalletLoadOrder,
  verifyWalletLoad,
  transferToCreatorForSeries,
  transferCommunityFee,
  getWalletTransactionHistory,
  getGiftHistory,
} = require('../controller/wallet.controller')
const { authenticateToken } = require('../middleware/auth')
const {
  paymentRateLimiter,
  generalRateLimiter,
} = require('../middleware/rateLimiter')
const {
  validateWalletLoad,
  validateSeriesPurchase,
  validateCommunityFee,
} = require('../middleware/validation')

// Get wallet details and recent transfers
router.get('/', authenticateToken, generalRateLimiter, getWalletDetails)

// Load money from bank to wallet
router.post(
  '/load/create-order',
  authenticateToken,
  paymentRateLimiter,
  validateWalletLoad,
  createWalletLoadOrder
)

// Verify wallet load order
router.post(
  '/load/verify',
  authenticateToken,
  paymentRateLimiter,
  verifyWalletLoad
)

// Transfer money from user wallet to creator wallet (70/30 split)
router.post(
  '/transfer-series',
  authenticateToken,
  paymentRateLimiter,
  validateSeriesPurchase,
  transferToCreatorForSeries
)

// Transfer community fee from creator to founder
router.post(
  '/transfer/community-fee',
  authenticateToken,
  paymentRateLimiter,
  validateCommunityFee,
  transferCommunityFee
)

// Get wallet transaction history
router.get(
  '/transactions',
  authenticateToken,
  generalRateLimiter,
  getWalletTransactionHistory
)

// Get gift history
router.get('/gifts', authenticateToken, generalRateLimiter, getGiftHistory)

module.exports = router
