const Notification = require('../models/Notification')
const { handleError } = require('../utils/utils')
const { getConnectedUsers } = require('../utils/websocket')

const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 20, unreadOnly = false } = req.query

    const query = { user_id: userId }
    if (unreadOnly === 'true') {
      query.read = false
    }

    const notifications = await Notification.find(query)
      .populate('from_user_id', 'username profile_photo')
      .sort({ created_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()

    const totalNotifications = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({ user_id: userId, read: false })

    res.status(200).json({
      success: true,
      notifications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalNotifications / limit),
        totalNotifications,
        hasMore: page * limit < totalNotifications
      },
      unreadCount
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const markNotificationAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { notificationId } = req.params

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user_id: userId },
      { read: true },
      { new: true }
    )

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      })
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read'
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id

    await Notification.updateMany(
      { user_id: userId, read: false },
      { read: true }
    )

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getWebSocketStats = async (req, res, next) => {
  try {
    const connectedUsers = getConnectedUsers()
    
    res.status(200).json({
      success: true,
      stats: {
        connectedUsers,
        serverTime: new Date()
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getWebSocketStats
}
