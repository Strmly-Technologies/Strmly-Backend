const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const User = require('../models/User')

let io

const initializeWebSocket = (server) => {
  io = new Server(server, {
   cors: {
      origin: [
        process.env.FRONTEND_URL || "http://localhost:3000",
        "http://localhost:3001", 
        "https://strmly.com"
      ],
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  })
  // Authentication middleware for WebSocket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '')
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'))
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.userId).select('username email profile_photo')
      
      if (!user) {
        return next(new Error('Authentication error: User not found'))
      }

      socket.userId = user._id.toString()
      socket.user = user
      next()
    } catch (error) {
      next(new Error('Authentication error: Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.username} connected with socket ID: ${socket.id}`)
    
    // Join user to their personal room for targeted notifications
    socket.join(`user_${socket.userId}`)
    
    // Handle user disconnect
    socket.on('disconnect', () => {
      console.log(`User ${socket.user.username} disconnected`)
      socket.leave(`user_${socket.userId}`)
    })

    // Handle marking notifications as read
    socket.on('mark_notification_read', (notificationId) => {
      console.log(`User ${socket.userId} marked notification ${notificationId} as read`)
      // You can add logic here to update notification status in database
    })

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to notification service',
      userId: socket.userId,
      username: socket.user.username
    })
  })

  return io
}

const emitNotificationToUser = (userId, notification) => {
    console.log(`Emitting notification to user ${userId}:`, notification.type)
  if (io) {
    io.to(`user_${userId}`).emit('new_notification', notification)
    console.log(`Notification emitted to user ${userId}:`, notification.type)
  }
}

const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data)
  }
}

const getConnectedUsers = () => {
  if (io) {
    return io.sockets.sockets.size
  }
  return 0
}

module.exports = {
  initializeWebSocket,
  emitNotificationToUser,
  emitToAll,
  getConnectedUsers
}
