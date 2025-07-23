const { Queue } = require('bullmq')

let notificationQueue

try {
  const redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
  }
  
  notificationQueue = new Queue('notificationQueue', {
    connection: redisConnection,
    defaultJobOptions: {
      // Fix: Use objects instead of numbers
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      }
    }
  })
  
  console.log('✅ Notification queue initialized')
} catch (error) {
  console.warn('⚠️ Could not initialize notification queue:', error.message)
}

const addVideoLikeNotificationToQueue = async (
  userId,
  likedUserId,
  videoId,
  likedUserName,
  videoName,
  likedUserProfilePhoto
) => {
  try {
    await notificationQueue.add('sendNotification', {
      to: userId,
      from: likedUserId,
      group: 'non-revenue',
      type: 'video like',
      display: `${likedUserName} liked your video "${videoName}"`,
      videoId: videoId,
      avatar: likedUserProfilePhoto,
      timeStamp: new Date(),
      read: false,
      URL: `/api/v1/videos/${videoId}`,
    })
  } catch (err) {
    throw new NotificationQueueError(err.message)
  }
}

const addVideoCommentNotificationToQueue = async (
  userId,
  commentedUserId,
  videoId,
  commentedUserName,
  videoName,
  commentedUserProfilePhoto,
  commentId,
  commentText
) => {
  try {
    await notificationQueue.add('sendNotification', {
      to: userId,
      from: commentedUserId,
      group: 'non-revenue',
      type: 'video comment',
      display: `${commentedUserName} commented on your video "${videoName}"`,
      commentId,
      commentText,
      videoId: videoId,
      avatar: commentedUserProfilePhoto,
      timeStamp: new Date(),
      read: false,
      URL: `/api/v1/videos/${videoId}`,
    })
  } catch (err) {
    throw new NotificationQueueError(err.message)
  }
}

const addVideoReshareNotificationToQueue = async (
  userId,
  resharedUserId,
  videoId,
  resharedUserName,
  videoName,
  resharedUserProfilePhoto
) => {
  try {
    await notificationQueue.add('sendNotification', {
      to: userId,
      from: resharedUserId,
      group: 'non-revenue',
      type: 'video reshare',
      display: `${resharedUserName} reshared your video "${videoName}"`,
      videoId: videoId,
      avatar: resharedUserProfilePhoto,
      timeStamp: new Date(),
      read: false,
      URL: `/api/v1/videos/${videoId}`,
    })
  } catch (err) {
    throw new NotificationQueueError(err.message)
  }
}

const addCommentUpvoteNotificationToQueue = async (
  userId,
  upvotedUserId,
  videoId,
  upvotedUserName,
  videoName,
  upvotedUserProfilePhoto,
  commentId
) => {
  try {
    await notificationQueue.add('sendNotification', {
      to: userId,
      from: upvotedUserId,
      group: 'non-revenue',
      type: 'comment upvote',
      display: `${upvotedUserName} upvoted your comment on video "${videoName}"`,
      commentId,
      videoId: videoId,
      avatar: upvotedUserProfilePhoto,
      timeStamp: new Date(),
      read: false,
      URL: `/api/v1/videos/${videoId}`,
    })
  } catch (err) {
    throw new NotificationQueueError(err.message)
  }
}

const addCommentLikeNotificationToQueue = async (
  userId,
  likedUserId,
  videoId,
  likedUserName,
  videoName,
  likedUserProfilePhoto,
  commentId
) => {
  try {
    await notificationQueue.add('sendNotification', {
      to: userId,
      from: likedUserId,
      group: 'non-revenue',
      type: 'comment like',
      display: `${likedUserName} liked your comment on video "${videoName}"`,
      commentId,
      videoId: videoId,
      avatar: likedUserProfilePhoto,
      timeStamp: new Date(),
      read: false,
      URL: `/api/v1/videos/${videoId}`,
    })
  } catch (err) {
    throw new NotificationQueueError(err.message)
  }
}

const addCommentGiftNotificationToQueue = async (
  userId,
  giftedUserId,
  videoId,
  giftedUserName,
  videoName,
  giftedUserProfilePhoto,
  commentId,
  amount
) => {
  try {
    await notificationQueue.add('sendNotification', {
      to: userId,
      from: giftedUserId,
      group: 'revenue',
      type: 'comment gift',
      display: `${giftedUserName} gifted Rs.${amount} to your comment video "${videoName}"`,
      commentId,
      videoId: videoId,
      avatar: giftedUserProfilePhoto,
      timeStamp: new Date(),
      read: false,
      URL: `/api/v1/videos/${videoId}`,
    })
  } catch (err) {
    throw new NotificationQueueError(err.message)
  }
}

const addCommentReplyNotificationToQueue = async (
  userId,
  repliedUserId,
  videoId,
  repliedUserName,
  videoName,
  repliedUserProfilePhoto,
  commentId,
  replyId,
  replyText
) => {
  try {
    await notificationQueue.add('sendNotification', {
      to: userId,
      from: repliedUserId,
      group: 'non-revenue',
      type: 'comment reply',
      display: `${repliedUserName} replied to your comment on video "${videoName}"`,
      commentId,
      replyId,
      replyText,
      videoId: videoId,
      avatar: repliedUserProfilePhoto,
      timeStamp: new Date(),
      read: false,
      URL: `/api/v1/videos/${videoId}`,
    })
  } catch (err) {
    throw new NotificationQueueError(err.message)
  }
}

module.exports = {
  addVideoLikeNotificationToQueue,
  addVideoCommentNotificationToQueue,
  addCommentUpvoteNotificationToQueue,
  addCommentLikeNotificationToQueue,
  addCommentGiftNotificationToQueue,
  addVideoReshareNotificationToQueue,
  addCommentReplyNotificationToQueue,
}
