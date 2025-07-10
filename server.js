const express = require('express')
const dotenv = require('dotenv')
const connectDB = require('./config/database')
const authRoutes = require('./routes/auth.routes')
const videoRoutes = require('./routes/video.routes')
const seriesRoutes = require('./routes/series.routes')
const shortsRoutes = require('./routes/shorts.routes')
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
try {
  app.use('/api/v1/auth', authRoutes)
  console.log('✓ Auth routes loaded')
  
  app.use('/api/v1/videos', videoRoutes)
  console.log('✓ Video routes loaded')
  
  app.use('/api/v1/series', seriesRoutes)
  console.log('✓ Series routes loaded')
  
  app.use('/api/v1/shorts', shortsRoutes)
  console.log('✓ Shorts routes loaded')
  
  app.use('/api/v1/user', userRoutes)
  console.log('✓ User routes loaded')
  
  app.use('/api/v1/community', communityRoutes)
  console.log('✓ Community routes loaded')
  
  app.use('/api/v1/interaction', interactionRoutes)
  console.log('✓ Interaction routes loaded')
  
  app.use('/api/v1/caution', cautionRoutes)
  console.log('✓ Caution routes loaded')
  
  app.use('/api/v1/search', searchRoutes)
  console.log('✓ Search routes loaded')
  
  app.use('/api/v1/wallet', walletRoutes)
  console.log('✓ Wallet routes loaded')
  
  app.use('/api/v1/withdrawals', withdrawalRoutes)
  console.log('✓ Withdrawal routes loaded')
  
  app.use('/api/v1/webhooks', webhookRoutes)
  console.log('✓ Webhook routes loaded')
  
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
  } catch (err) {
    console.error(' Database connection failed:', err)
  }

  await testS3Connection()
})
