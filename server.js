const express = require('express')
const dotenv = require('dotenv')
const connectDB = require('./config/database')
const authRoutes = require('./routes/auth.routes')
const videoRoutes = require('./routes/video.routes')
const seriesRoutes = require('./routes/series.routes')
const draftRoutes=require('./routes/draft.routes')
const userRoutes = require('./routes/user.routes')
const communityRoutes = require('./routes/community.routes')
const interactionRoutes = require('./routes/interaction.routes')
const cautionRoutes = require('./routes/caution.routes')
const searchRoutes = require('./routes/search.routes')
const deactivateRoutes=require('./routes/deactivate.routes')
const seriesAnalyticsRoutes = require('./routes/seriesAnalytics.routes')
const communityAnalyticsRoutes = require('./routes/communityAnalytics.routes')

const walletRoutes = require('./routes/wallet.routes')
const withdrawalRoutes = require('./routes/withdrawal.routes')
const webhookRoutes = require('./routes/webhook.routes')

const cors = require('cors')
const validateEnv = require('./config/validateEnv')
const { testS3Connection } = require('./utils/connection_testing')
const { connectRedis } = require('./config/redis')
const { RedisConnectionError } = require('./utils/errors')
const { initializeWebSocket } = require('./utils/websocket')
require('./utils/notification_worker') // Start the notification worker

dotenv.config()
validateEnv()

const app = express()

const corsOptions = {
  origin: ['http://localhost:3000', 'https://strmly.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}
app.use(cors(corsOptions))

// Raw body parser for webhooks (before express.json())
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3001

const routes = [
  { path: '/api/v1/auth', handler: authRoutes },
  { path: '/api/v1/videos', handler: videoRoutes },
  { path: '/api/v1/series', handler: seriesRoutes },
  { path: '/api/v1/user', handler: userRoutes },
   {path:'/api/v1/drafts',handler: draftRoutes},
  { path: '/api/v1/community', handler: communityRoutes },
  { path: '/api/v1/interaction', handler: interactionRoutes },
  { path: '/api/v1/caution', handler: cautionRoutes },
  { path: '/api/v1/search', handler: searchRoutes },
  { path: '/api/v1/wallet', handler: walletRoutes },
  { path: '/api/v1/withdrawals', handler: withdrawalRoutes },
  { path: '/api/v1/webhooks', handler: webhookRoutes },
  {path: '/api/v1/test', handler: require('./routes/test.routes') }, 
  { path: '/api/v1/deactivate', handler: deactivateRoutes} ,
  { path: '/api/v1/analytics/series', handler: seriesAnalyticsRoutes },
  { path: '/api/v1/analytics/community', handler: communityAnalyticsRoutes }


]

try {
  routes.forEach(({ path, handler }) => {
    app.use(path, handler)
    console.log(`✓ ${path} routes loaded`)
  })
} catch (error) {
  console.error('Error loading routes:', error.message)
  process.exit(1)
}

app.get('/health', (req, res) => {
  res.send('Server is healthy')
})

const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)

  try {
    await connectDB()
    console.log(' MongoDB connected')
    
    await connectRedis()
    console.log(' Redis connected')
    
    // Initialize WebSocket after Redis is connected
    initializeWebSocket(server)
    console.log(' WebSocket initialized')
    
  } catch (err) {
    if (err instanceof RedisConnectionError) {
      console.error(' Redis connection failed:', err.message)
    } else {
      console.error(' Database connection failed:', err)
    }
  }

  await testS3Connection()
})