const { RedisClient } = require('../config/redis')

const STREAM_KEY = process.env.REDIS_STREAM_KEY

const ALLOWED_TYPES = new Set([
  'nsfw_detection',
  'video_fingerprint',
  'audio_fingerprint',
])

/**
 * Add a video processing event to the Redis Stream.
 * Trims stream to ~100k entries to avoid unbounded growth.
 */
const addVideoToStream = async (videoId, videoUrl, userId, type) => {
  if (!videoId || !videoUrl || !type || !userId) {
    throw new Error('videoId, videoUrl, type and userId are required')
  }
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(
      `Invalid type "${type}". Allowed: ${[...ALLOWED_TYPES].join(', ')}`
    )
  }

  try {
    // XADD STREAM MAXLEN ~ 100000 * field value ...
    await RedisClient().xadd(
      STREAM_KEY,
      'MAXLEN',
      '~',
      '100000',
      '*',
      'videoId',
      String(videoId),
      'videoUrl',
      String(videoUrl),
      'userId',
      userId != null ? String(userId) : '',
      'type',
      type
    )
    console.log(`✅ Enqueued ${type} for ${videoId} → "${STREAM_KEY}"`)
  } catch (err) {
    console.error(`❌ Failed to enqueue: ${err.message}`)
    throw err
  }
}

module.exports = addVideoToStream
