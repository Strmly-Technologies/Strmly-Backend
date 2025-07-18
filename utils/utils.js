const multer = require('multer')
const { s3 } = require('../config/AWS')
const { v4: uuidv4 } = require('uuid')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const dynamicVideoUpload = (req, res, next) => {
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
      console.log('File rejected')
      cb(new Error('Only video files are allowed (MP4, AVI, MOV, WMV)'))
    }
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: fileFilter,
  }).fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'name', maxCount: 1 },
    { name: 'description', maxCount: 1 },
    { name: 'genre', maxCount: 1 },
    { name: 'type', maxCount: 1 },
    { name: 'language', maxCount: 1 },
    { name: 'age_restriction', maxCount: 1 },
    { name: 'communityId', maxCount: 1 },
    { name: 'seriesId', maxCount: 1 },
  ])

  upload(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err.message)
      return res.status(400).json({ error: err.message })
    }

    next()
  })
}

const validateVideoFormData = (req, res, next) => {
  const videoFile = req.files?.videoFile?.[0]
  if (!videoFile) {
    console.error('Invalid or missing video file')
    return res.status(400).json({
      error: 'Video file is required',
    })
  }

  const maxSize = 200 * 1024 * 1024
  if (videoFile.size > maxSize) {
    console.error('Video too large')
    return res.status(400).json({
      error: 'Video too large',
    })
  }
  next()
}

const communityProfilePhotoUpload = (req, res, next) => {
  const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/jpg',
    ]

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    const fileExtension = file.originalname
      .toLowerCase()
      .slice(file.originalname.lastIndexOf('.'))

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(fileExtension)
    ) {
      console.log('Image file accepted')
      cb(null, true)
    } else {
      console.log('Image file rejected')
      cb(new Error('Only image files are allowed (JPG, PNG, GIF, WEBP)'))
    }
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, //limit 5mb
  }).fields([
    { name: 'imageFile', maxCount: 1 },
    { name: 'communityId', maxCount: 1 },
  ])

  upload(req, res, (err) => {
    if (err) {
      console.error('Multer image upload error:', err.message)
      return res.status(400).json({ error: err.message })
    }

    next()
  })
}

const validateCommunityProfilePhotoFormData = (req, res, next) => {
  const imageFile = req.files?.imageFile?.[0]
  if (!imageFile) {
    console.error('Invalid or missing image file')
    return res.status(400).json({
      error: 'Image file is required',
    })
  }

  const communityId = req.body.communityId
  if (!communityId) {
    console.error('Missing community ID')
    return res.status(400).json({
      error: 'Community ID is required',
    })
  }

  const maxSize = 5 * 1024 * 1024 // 5MB
  if (imageFile.size > maxSize) {
    console.error('Image too large')
    return res.status(400).json({
      error: 'Image too large. Max size is 5MB',
    })
  }

  next()
}

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large. Maximum size is 200MB',
      })
    }
  }
  if (err.message === 'Only mp4 files are allowed') {
    return res.status(400).json({ error: 'Only MP4 files are allowed' })
  }
  next(err)
}

const uploadVideoToS3 = async (
  compressedVideoBuffer,
  fileOriginalName,
  fileMimeType
) => {
  const fileExtension = fileOriginalName.split('.').pop()
  const fileName = `long_video/${uuidv4()}.${fileExtension}`
  try {
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileName,
      Body: compressedVideoBuffer,
      ContentType: fileMimeType,
      Metadata: {
        originalName: fileOriginalName,
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

const createImageMulter = (maxSize = 5 * 1024 * 1024) => {
  const storage = multer.memoryStorage()

  const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, WebP, GIF)'))
    }
  }

  return multer({
    storage: storage,
    limits: { fileSize: maxSize },
    fileFilter: fileFilter,
  })
}

const uploadImageToS3 = async (
  fileOriginalName,
  fileMimetype,
  fileBuffer,
  folder = 'images'
) => {
  try {
    const fileExtension = fileOriginalName.split('.').pop()
    const fileName = `${folder}/${uuidv4()}.${fileExtension}`

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileName,
      Body: fileBuffer,
      ContentType: fileMimetype,
      Metadata: {
        originalName: fileOriginalName,
        uploadDate: new Date().toISOString(),
      },
    }

    const result = await s3.upload(uploadParams).promise()
    return {
      success: true,
      message: 'Image uploaded successfully',
      url: result.Location,
      key: result.Key,
    }
  } catch (error) {
    console.error('Error uploading image to S3:', error)
    return {
      success: false,
      message: 'Failed to upload image',
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
  if (err?.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: Object.values(err.errors).map((e) => e.message),
      code: 'VALIDATION_ERROR',
    })
  }

  if (err?.name === 'FFmpegError') {
    return res.status(500).json({
      success: false,
      error: 'FFmpeg process failed',
      code: 'FFmpeg_Error',
    })
  }

  if (err?.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
      code: 'INVALID_ID',
    })
  }

  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry found',
      code: 'DUPLICATE_ENTRY',
    })
  }

  if (err?.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    })
  }

  if (err?.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
    })
  }

  // Mongoose connection errors
  if (err?.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
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

const generateVideoThumbnail = (videoPath) => {
  const thumbnailFilename = `thumb-${uuidv4()}.jpg`
  const thumbnailPath = path.join(__dirname, thumbnailFilename)

  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn('ffmpeg', [
      '-i',
      videoPath,
      '-ss',
      '00:00:01',
      '-vframes',
      '1',
      '-q:v',
      '2',
      thumbnailPath,
    ])

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(data.toString())
    })

    ffmpegProcess.on('error', (error) => {
      console.error('FFmpeg-Error:', error)
      fs.unlinkSync(videoPath)
      const errorMsg = `FFmpeg-Error:${error.message}`
      const err = new Error(errorMsg)
      err.name = 'FFmpegError'
      reject(err)
    })

    ffmpegProcess.on('exit', (code) => {
      if (code !== 0) {
        fs.unlinkSync(videoPath)
        const msg = `FFmpeg exited with code ${code}`
        console.error(msg)
        const errorMsg = `FFmpeg-Error:${msg}`
        const err = new Error(errorMsg)
        err.name = 'FFmpegError'
        return reject(err)
      }

      try {
        const imageBuffer = fs.readFileSync(thumbnailPath)
        fs.unlinkSync(thumbnailPath) // clean up
        fs.unlinkSync(videoPath)
        resolve(imageBuffer)
      } catch (error) {
        fs.unlinkSync(videoPath)
        if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath)
        const errorMsg = `FFmpeg-Error:${error.message}`
        const err = new Error(errorMsg)
        err.name = 'FFmpegError'
        reject(err)
      }
    })
  })
}

module.exports = {
  handleMulterError,
  validateVideoFormData,
  createImageMulter,
  dynamicVideoUpload,
  handleError,
  uploadVideoToS3,
  uploadImageToS3,
  validateCommunityProfilePhotoFormData,
  communityProfilePhotoUpload,
  generateVideoThumbnail,
}
