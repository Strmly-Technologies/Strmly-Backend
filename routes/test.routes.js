const express = require('express')
const router = express.Router()
const { emitNotificationToUser } = require('../utils/websocket')
const { authenticateToken } = require('../middleware/auth')

// Test notification endpoint
router.post('/notification', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { message, type } = req.body
    // Create test notification
    const testNotification = {
      id: 'test_' + Date.now(),
      type: type || 'test',
      title: ' Test Notification',
      message: message || 'This is a manual test notification!',
      avatar: req.user.profile_photo || '',
      timestamp: new Date(),
      read: false,
      url: '#',
      group: 'test',
      data: {
        testData: true
      }
    }

    // Emit to WebSocket
    emitNotificationToUser(userId, testNotification)

    res.json({
      success: true,
      message: 'Test notification sent',
      notification: testNotification,
      userId: userId
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

module.exports = router