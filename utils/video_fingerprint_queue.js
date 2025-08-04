const { Queue } = require('bullmq')
const { VideoQueueError } = require('./errors.js')
let videoQueue

try {
  const redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
  }

  videoQueue = new Queue('videoQueue', {
    connection: redisConnection,
    defaultJobOptions: {
      // Fix: Use objects instead of numbers
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  })

  console.log('video queue initialized')
} catch (error) {
  console.warn('⚠️ Could not initialize video queue:', error.message)
}

const addVideoToQueue = async (videoId, videoUrl) => {
  try {
    await videoQueue.add('verifyDuplication', {
      videoId,
      videoUrl,
    })
  } catch (err) {
    throw new VideoQueueError(err.message)
  }
}

module.exports = addVideoToQueue
