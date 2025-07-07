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
  origin: ['http://localhost:3000'], // ✅ replace with your frontend URL
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

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/videos', videoRoutes)
app.use('/api/v1/series', seriesRoutes)
app.use('/api/v1/shorts', shortsRoutes)
app.use('/api/v1/user', userRoutes)
app.use('/api/v1/community', communityRoutes)
app.use('/api/v1/interaction', interactionRoutes)
app.use('/api/v1/caution', cautionRoutes)
app.use('/api/v1/search', searchRoutes)

app.use('/api/v1/wallet', walletRoutes)
app.use('/api/v1/withdrawals', withdrawalRoutes)
app.use('/api/v1/webhooks', webhookRoutes)

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
