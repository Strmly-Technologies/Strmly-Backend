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

router.get('/reports', authenticateAdmin, getReports)
router.put('/report/:id', authenticateAdmin, updateReportStatus)

module.exports = router
module.exports = router
