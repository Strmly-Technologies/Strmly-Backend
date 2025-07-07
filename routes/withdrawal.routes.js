const router = require('express').Router()
const {
  createWithdrawalRequest,
  getWithdrawalHistory,
  checkWithdrawalStatus,
} = require('../controller/withdrawal.controller')
const { setupCreatorBankAccount } = require('../controller/creator.controller')
const { authenticateToken } = require('../middleware/auth')
const {
  withdrawalRateLimiter,
  bankSetupRateLimiter,
  generalRateLimiter,
} = require('../middleware/rateLimiter')
const {
  validateBankSetup,
  validateWithdrawal,
} = require('../middleware/validation')

// Setup bank account for withdrawals
router.post(
  '/setup-bank',
  authenticateToken,
  bankSetupRateLimiter,
  validateBankSetup,
  setupCreatorBankAccount
)

// Create withdrawal request
router.post(
  '/create',
  authenticateToken,
  withdrawalRateLimiter,
  validateWithdrawal,
  createWithdrawalRequest
)

// Get withdrawal history
router.get(
  '/history',
  authenticateToken,
  generalRateLimiter,
  getWithdrawalHistory
)

// Check specific withdrawal status
router.get(
  '/status/:withdrawalId',
  authenticateToken,
  generalRateLimiter,
  checkWithdrawalStatus
)

module.exports = router
