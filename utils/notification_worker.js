const { Worker } = require('bullmq')
const { emitNotificationToUser } = require('./websocket')
const Notification = require('../models/Notification')
const sendPushNotification = require('./push_notification')

let notificationWorker
const maxRetries = 3
let retryCount = 0

const initializeWorker = async () => {
  try {
    // Create Redis connection config for BullMQ
    const redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
    }

    console.log('✅ Initializing notification worker...')

    // Create the BullMQ worker
    notificationWorker = new Worker(
      'notificationQueue',
      async (job) => {
        try {
          const notificationData = job.data
          console.log('Processing notification:', notificationData.type)

          // Save notification to database
          const notification = new Notification({
            user_id: notificationData.to,
            from_user_id: notificationData.from,
            type: notificationData.type,
            title: getNotificationTitle(notificationData.type),
            message: notificationData.display,
            data: {
              videoId: notificationData.videoId,
              commentId: notificationData.commentId,
              replyId: notificationData.replyId,
              commentText: notificationData.commentText,
              replyText: notificationData.replyText,
              avatar: notificationData.avatar,
              URL: notificationData.URL,
            },
            group: notificationData.group,
            read: notificationData.read || false,
            created_at: notificationData.timeStamp || new Date(),
          })

          await notification.save()

          // Prepare notification for WebSocket emission
          const socketNotification = {
            id: notification._id,
            type: notificationData.type,
            title: getNotificationTitle(notificationData.type),
            message: notificationData.display,
            avatar: notificationData.avatar,
            timestamp: notificationData.timeStamp || new Date(),
            read: false,
            url: notificationData.URL,
            group: notificationData.group,
            data: {
              videoId: notificationData.videoId,
              commentId: notificationData.commentId,
              replyId: notificationData.replyId,
            },
          }
          await sendPushNotification(
            notificationData.fcmToken,
            socketNotification.title,
            socketNotification.message,
            socketNotification
          )
          // Emit notification to specific user via WebSocket
          emitNotificationToUser(notificationData.to, socketNotification)

          return { success: true, notificationId: notification._id }
        } catch (error) {
          console.error('Error processing notification:', error)
          throw error
        }
      },
      {
        connection: redisConnection,
        concurrency: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    )

    // Event listeners
    notificationWorker.on('completed', (job, result) => {
      console.log(`✅ Notification job ${job.id} completed:`, result)
      retryCount = 0
    })

    notificationWorker.on('failed', (job, err) => {
      console.error(
        `❌ Notification job ${job?.id || 'unknown'} failed:`,
        err.message
      )
    })

    notificationWorker.on('error', (err) => {
      console.error('❌ Notification worker error:', err.message)

      // Don't restart worker on Redis script errors
      if (!err.message.includes('user_script') && retryCount < maxRetries) {
        retryCount++
        console.log(
          `⚠️ Restarting worker (attempt ${retryCount}/${maxRetries})...`
        )
        setTimeout(() => {
          initializeWorker()
        }, 5000)
      }
    })

    notificationWorker.on('stalled', (jobId) => {
      console.warn(`⚠️ Job ${jobId} stalled, will be retried`)
    })

    console.log('✅ Notification worker initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing notification worker:', error.message)

    if (retryCount < maxRetries) {
      retryCount++
      console.warn(
        `⚠️ Retrying worker initialization (${retryCount}/${maxRetries}) in 5 seconds...`
      )
      setTimeout(initializeWorker, 5000)
    } else {
      console.error('❌ Max retries reached. Worker initialization failed.')
    }
  }
}

const getNotificationTitle = (type) => {
  const titles = {
    'video like': ' Video Liked',
    'video comment': ' New Comment',
    'video reshare': ' Video Reshared',
    'comment upvote': ' Comment Upvoted',
    'comment like': ' Comment Liked',
    'comment gift': ' Gift Received',
    'comment reply': '↩ New Reply',
  }
  return titles[type] || '🔔 Notification'
}

// Start initialization after a delay
setTimeout(initializeWorker, 3000)

module.exports = {
  getWorker: () => notificationWorker,
  initializeWorker,
}
