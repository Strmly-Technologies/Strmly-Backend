const { Queue } = require('bullmq')
let videoProcessingQueue

try {
  // initialize the queue with Redis connection details
 const redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
    }

  console.log('Redis connection for video procc BullMQ established')
  videoProcessingQueue = new Queue('video-processing', {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  })
  console.log('Video processing queue initialized')
} catch (error) {
    console.warn('Could not initialize video processing queue:', error.message)
}

const addVideoToProcessingQueue=async(getVideoById, s3key, userId)=>{
    try{
        await videoProcessingQueue.add('processVideo', {
            videoId: getVideoById,
            s3Key: s3key,
            userId: userId
          })
          console.log('Video added to processing queue') 
    } catch (error) {
        throw new Error(error.message)
        
    }
}

module.exports = { videoProcessingQueue, addVideoToProcessingQueue }
