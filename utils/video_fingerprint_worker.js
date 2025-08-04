const { Worker } = require('bullmq')
const { fingerprintVideo, findVideoDuplicates } = require('./fingerprint_video')

let findDuplicateworker
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

    console.log('✅ Initializing worker...')

    // Create the BullMQ worker
    findDuplicateworker = new Worker(
      'videoQueue',
      async (job) => {
        try {
          const videodata = job.data
          await fingerprintVideo(videodata.videoId, videodata.videoUrl)
          const duplicates = await findVideoDuplicates(videodata.videoId)

          //emit result to admin dashboard
          return { success: true, videoId: videodata.videoId, duplicates }
        } catch (error) {
          console.error('Error finding duplicates:', error)
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
    findDuplicateworker.on('completed', (job, result) => {
      console.log(`✅ job ${job.id} completed:`, result)
      retryCount = 0
    })

    findDuplicateworker.on('failed', (job, err) => {
      console.error(`❌ job ${job?.id || 'unknown'} failed:`, err.message)
    })

    findDuplicateworker.on('error', (err) => {
      console.error('❌ video worker error:', err.message)

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

    findDuplicateworker.on('stalled', (jobId) => {
      console.warn(`⚠️ Job ${jobId} stalled, will be retried`)
    })

    console.log('✅ worker initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing worker:', error.message)

    if (retryCount < maxRetries) {
      retryCount++
      console.warn(
        `⚠️ Retrying initialization (${retryCount}/${maxRetries}) in 5 seconds...`
      )
      setTimeout(initializeWorker, 5000)
    } else {
      console.error('❌ Max retries reached. Worker initialization failed.')
    }
  }
}

// Start initialization after a delay
setTimeout(initializeWorker, 3000)

module.exports = {
  getWorker: () => findDuplicateworker,
  initializeWorker,
}
