const multer = require('multer')
const { s3 } = require('../config/AWS')
const { v4: uuidv4 } = require('uuid')

const createVideoMulter = (maxSize) => {
  const storage = multer.memoryStorage()

  const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'application/octet-stream',
    ]

    const allowedExtensions = ['.mp4', '.avi', '.mov', '.wmv']
    const fileExtension = file.originalname.toLowerCase().slice(-4)

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(fileExtension)
    ) {
      console.log('✅ File accepted')
      cb(null, true)
    } else {
      console.log('❌ File rejected')
      cb(new Error('Only video files are allowed (MP4, AVI, MOV, WMV)'))
    }
  }

  return multer({
    storage: storage,
    limits: { fileSize: maxSize },
    fileFilter: fileFilter,
  })
}

const dynamicVideoUpload = (req, res, next) => {
  const videoType = req.query.type || req.body.type

  if (!videoType || !['short', 'long'].includes(videoType)) {
    console.error('Invalid or missing video type')
    return res.status(400).json({
      error: 'Video type is required. Use ?type=short or ?type=long',
    })
  }

  const maxSize = videoType === 'short' ? 50 * 1024 * 1024 : 200 * 1024 * 1024

  req.videoType = videoType

  const upload = createVideoMulter(maxSize)

  upload.single('video')(req, res, (err) => {
    if (err) {
      console.error(' Multer error:', err.message)
    }

    next(err)
  })
}

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `File too large. Maximum size is ${req.videoType === 'short' ? '50MB' : '200MB'}`,
      })
    }
  }
  if (err.message === 'Only mp4 files are allowed') {
    return res.status(400).json({ error: 'Only MP4 files are allowed' })
  }
  next(err)
}

const uploadVideoToS3 = async (file, videoType) => {
  try {
    const fileExtension = file.originalname.split('.').pop()
    const fileName = `${videoType}/${uuidv4()}.${fileExtension}`

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private',
      Metadata: {
        videoType: videoType,
        originalName: file.originalname,
        uploadDate: new Date().toISOString(),
      },
    }

    const result = await s3.upload(uploadParams).promise()
    return {
      success: true,
      message: 'Video uploaded successfully',
      url: result.Location,
      key: result.Key,
      Bucket: result.Bucket,
      videoType: videoType,
    }
  } catch (error) {
    console.error('Error uploading video to S3:', error)
    return {
      success: false,
      message: 'Failed to upload video',
      error: error.message,
    }
  }
}

const handleError = (err, req, res) => {
  // Log error for debugging (remove sensitive information)
  const sanitizedError = {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  }

  console.error('API Error:', sanitizedError)

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: Object.values(err.errors).map((e) => e.message),
      code: 'VALIDATION_ERROR',
    })
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
      code: 'INVALID_ID',
    })
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry found',
      code: 'DUPLICATE_ENTRY',
    })
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
    })
  }

  // Mongoose connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    return res.status(503).json({
      success: false,
      error: 'Database connection error',
      code: 'DATABASE_ERROR',
    })
  }

  // Razorpay specific errors
  if (err.message && err.message.includes('razorpay')) {
    return res.status(400).json({
      success: false,
      error: 'Payment processing error',
      code: 'PAYMENT_ERROR',
    })
  }

  // Default error response
  res.status(err.statusCode || 500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
    code: 'INTERNAL_SERVER_ERROR',
  })
}

module.exports = {
  handleMulterError,
  createVideoMulter,
  dynamicVideoUpload,
  handleError,
  uploadVideoToS3,
}
