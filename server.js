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
const recommendationRoutes= require('./routes/recommendation.routes')
const testRoutes= require('./routes/test.routes')
const creatorRoutes=require('./routes/creatorpass.routes')

const walletRoutes = require('./routes/wallet.routes')
const withdrawalRoutes = require('./routes/withdrawal.routes')
const webhookRoutes = require('./routes/webhook.routes')
const adminRoutes = require('./routes/admin.routes')

const cors = require('cors')
const validateEnv = require('./config/validateEnv')
const { testS3Connection } = require('./utils/connection_testing')
const { connectRedis } = require('./config/redis')
const path = require('path')
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

// Serve admin static files
app.use('/admin', express.static(path.join(__dirname, 'admin')))

const PORT = process.env.PORT || 3001

// Mount routes
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/videos', videoRoutes)
app.use('/api/v1/series', seriesRoutes)
app.use('/api/v1/drafts', draftRoutes)
app.use('/api/v1/user', userRoutes)
app.use('/api/v1/community', communityRoutes)
app.use('/api/v1/interactions', interactionRoutes)
app.use('/api/v1/caution', cautionRoutes)
app.use('/api/v1/search', searchRoutes)
app.use('/api/v1/deactivate', deactivateRoutes)
app.use('/api/v1/series-analytics', seriesAnalyticsRoutes)
app.use('/api/v1/community-analytics', communityAnalyticsRoutes)
app.use('/api/v1/recommendations', recommendationRoutes)
app.use('/api/v1/test', testRoutes)
app.use('/api/v1/wallet', walletRoutes)
app.use('/api/v1/withdrawal', withdrawalRoutes)
app.use('/api/v1/webhooks', webhookRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/creator-pass', creatorRoutes)

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