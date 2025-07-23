const Redis = require('ioredis')
const { RedisConnectionError } = require('../utils/errors')

let RedisClient = null

const createRedisClient = () => {
  try {
    RedisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })

    RedisClient.on('connect', () => {
      console.log(' Redis connected successfully')
    })

    RedisClient.on('error', (err) => {
      console.error(' Redis connection error:', err)
    })

    RedisClient.on('ready', () => {
      console.log(' Redis ready for operations')
    })
  } catch (error) {
    throw error
  }
}

const connectRedis = async () => {
  try {
    createRedisClient()
    if (RedisClient && !RedisClient.status === 'ready') {
      await RedisClient.connect()
    }
    console.log('Redis connection established successfully')
  } catch (error) {
    throw new RedisConnectionError("Couldn't connect to Redis instance:", error)
  }
}

module.exports = {
  connectRedis,
  RedisClient,
}
