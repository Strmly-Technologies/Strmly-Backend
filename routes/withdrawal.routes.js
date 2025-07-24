const router = require('express').Router()
const {
  createWithdrawalRequest,
  getWithdrawalHistory,
  checkWithdrawalStatus,
  createUPIWithdrawalRequest,
} = require('../controller/withdrawal.controller')
const {
  setupCreatorBankAccount,
  setupCreatorUPI,
} = require('../controller/creator.controller')
const { authenticateToken } = require('../middleware/auth')
const {
  withdrawalRateLimiter,
  bankSetupRateLimiter,
  generalRateLimiter,
} = require('../middleware/rateLimiter')
const {
  validateBankSetup,
  validateUPISetup,
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
// Setup UPI for withdrawals
router.post(
  '/setup-upi',
  authenticateToken,
  bankSetupRateLimiter,
  validateUPISetup,
  setupCreatorUPI
)

// Create withdrawal request
router.post(
  '/create',
  authenticateToken,
  withdrawalRateLimiter,
  validateWithdrawal,
  createWithdrawalRequest
)

// Create withdrawal request using UPI
router.post(
  '/create/upi',
  authenticateToken,
  withdrawalRateLimiter,
  validateWithdrawal,
  createUPIWithdrawalRequest
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
