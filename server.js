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

const walletRoutes = require('./routes/wallet.routes')
const withdrawalRoutes = require('./routes/withdrawal.routes')
const webhookRoutes = require('./routes/webhook.routes')

const cors = require('cors')
const validateEnv = require('./config/validateEnv')
const { testS3Connection } = require('./utils/connection_testing')
const { connectRedis } = require('./config/redis')
const { RedisConnectionError } = require('./utils/errors')

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

const PORT = process.env.PORT

// Add error handling for route registration
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

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`)

  try {
    await connectDB()
    await connectRedis()
  } catch (err) {
    if (err instanceof RedisConnectionError) {
      console.log(err)
    } else {
      console.error(' Database connection failed:', err)
    }
  }

  await testS3Connection()
})
