const router = require('express').Router()
const {
  adminLogin,
  getAdminDashboard,
  getUsers,
  getTransactions,
  getPayments,
  getCreatorPasses,
  getStats,
  getSignedUpUsersOnDate,
  getReports,
  updateReportStatus,
  getTotalWalletLoad,
  getWithdrawals,
  processManualWithdrawal,
  getTransactionById,
  getUserTransactions,
  getFinancialOverview,
  getAutoNSFWViolations,
  getAutoCopyrightViolations,
  getContentModerationStats,
  getViolationsByUser,
  DeleteCopyVideo,
  ignoreVideo,
  getCommentGiftings,
  addMoneyToWallet,
} = require('../controller/admin.controller')
const { authenticateAdmin } = require('../middleware/adminAuth')

// Public login route
router.post('/login', adminLogin)

// Admin dashboard UI (protected)
router.get('/', authenticateAdmin, getAdminDashboard)

// API endpoints for dashboard data (protected)
router.get('/users', authenticateAdmin, getUsers)
router.get('/users-by-date', authenticateAdmin, getSignedUpUsersOnDate)
router.get('/transactions', authenticateAdmin, getTransactions)
router.get('/payments', authenticateAdmin, getPayments)
router.get('/creator-passes', authenticateAdmin, getCreatorPasses)
router.get('/stats', authenticateAdmin, getStats)
router.get('/wallet/load', authenticateAdmin, getTotalWalletLoad)
router.get('/reports', authenticateAdmin, getReports)
router.put('/report/:id', authenticateAdmin, updateReportStatus)
router.get('/withdrawals', authenticateAdmin, getWithdrawals)
router.post('/withdrawals/:id/process', authenticateAdmin, processManualWithdrawal)
router.get('/transaction/:id',authenticateAdmin,getTransactionById)
router.get('/user/transactions/:userId', authenticateAdmin, getUserTransactions)
router.get('/financial-overview', authenticateAdmin, getFinancialOverview)
router.get('/comment-giftings', authenticateAdmin, getCommentGiftings)

// Content moderation routes
router.get('/auto-nsfw-violations', authenticateAdmin, getAutoNSFWViolations)
router.get('/auto-copyright-violations', authenticateAdmin, getAutoCopyrightViolations)
router.get('/content-moderation-stats', authenticateAdmin, getContentModerationStats)
router.get('/user/:userId/violations', authenticateAdmin, getViolationsByUser)

// delete video with auto copyright violation
router.delete('/video/:videoId/:type', authenticateAdmin, DeleteCopyVideo)
// ignore video
router.post('/video/:videoId/ignore/:type',authenticateAdmin,ignoreVideo)

router.post('/wallet/add/:userId',authenticateAdmin,addMoneyToWallet)

module.exports = router
