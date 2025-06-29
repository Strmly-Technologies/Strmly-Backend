const router = require("express").Router();
const { uploadVideo } = require("../controller/videoControllers");

const multer = require("multer");

// Dynamic multer configuration based on video type
const createVideoMulter = (maxSize) => {
    return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: maxSize },
        fileFilter: (req, file, cb) => {
            if (file.mimetype === 'video/mp4') {
                cb(null, true);
            } else {
                cb(new Error('Only mp4 files are allowed'), false);
            }
        }
    });
};

const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: `File too large. Maximum size is ${req.videoType === 'short' ? '50MB' : '200MB'}` 
            });
        }
    }
    if (err.message === 'Only mp4 files are allowed') {
        return res.status(400).json({ error: 'Only MP4 files are allowed' });
    }
    next(err);
};

// Middleware to handle dynamic file size limits
const dynamicVideoUpload = (req, res, next) => {
    const videoType = req.query.type || req.body.type;
    
    if (!videoType || !['short', 'long'].includes(videoType)) {
        return res.status(400).json({ 
            error: 'Video type is required. Use ?type=short or ?type=long' 
        });
    }
    
    // Set file size limits based on video type
    const maxSize = videoType === 'short' 
        ? 50 * 1024 * 1024  // 50MB for short videos
        : 200 * 1024 * 1024; // 200MB for long videos
    
    req.videoType = videoType;
    
    const upload = createVideoMulter(maxSize);
    upload.single("video")(req, res, next);
};

// Single endpoint for video upload with type parameter
router.post("/upload", dynamicVideoUpload, uploadVideo,handleMulterError);

module.exports = router;