const Redis = require('ioredis')
const { RedisConnectionError } = require('../utils/errors')

let RedisClient

const createRedisClient = () => {
  try {
    RedisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000
    })

    RedisClient.on('connect', () => {
      console.log(' Connected to Redis')
    })

    RedisClient.on('ready', () => {
      console.log(' Redis is ready')
    })

    RedisClient.on('error', (err) => {
      console.error(' Redis connection error:', err.message)
    })

    RedisClient.on('close', () => {
      console.log(' Redis connection closed')
    })

  } catch (error) {
    console.error('Failed to create Redis client:', error.message)
    RedisClient = null
  }
}

const getRedisClient = () => {
  if (!RedisClient) {
    createRedisClient()
  }
  
  if (RedisClient && RedisClient.status !== 'ready') {
    throw new RedisConnectionError("Redis client is not ready")
  }
  
  return RedisClient
}


const connectRedis = async () => {
  try {
    if (!RedisClient) {
      createRedisClient()
    }
    
    // Fix the logical error here
    if (RedisClient && RedisClient.status !== 'ready') {
      await RedisClient.connect()
    }
    
    // Test the connection
    await RedisClient.ping()
    console.log(' Redis connection established successfully')
    
  } catch (error) {
    console.error('Redis connection failed:', error.message)
    throw new RedisConnectionError("Couldn't connect to Redis instance:", error)
  }
}

module.exports = {
  connectRedis,
  RedisClient: () => RedisClient,
  createRedisClient,
  getRedisClient
}