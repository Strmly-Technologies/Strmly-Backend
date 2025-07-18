const Redis = require('ioredis');

let redisClient=null;


const createRedisClient = () => {
  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      console.log(' Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      console.error(' Redis connection error:', err);
    });

    redisClient.on('ready', () => {
      console.log(' Redis ready for operations');
    });

    return redisClient;
  } catch (error) {
    console.error(' Failed to create Redis client:', error);
    return null;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};


const connectRedis = async () => {
  try {
    const client = getRedisClient();
    if (client && !client.status === 'ready') {
      await client.connect();
    }
    return client;
  } catch (error) {
    console.error(' Redis connection failed:', error);
    return null;
  }
};

module.exports = {
  createRedisClient,
  getRedisClient,
  connectRedis,
};