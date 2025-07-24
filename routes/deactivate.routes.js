const express = require('express')
const router = express.Router()
const { getAccountStatus, deactivateAccount, reactivateAccount } = require('../controller/deactivate.controller')
const { authenticateToken } = require("../middleware/auth");

router.get('/status', authenticateToken, getAccountStatus)
router.post('/deactivate', authenticateToken, deactivateAccount)
router.post('/reactivate', authenticateToken, reactivateAccount)

module.exports = router