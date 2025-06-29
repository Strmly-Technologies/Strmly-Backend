const jwt = require("jsonwebtoken");
const multer = require("multer");

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const createVideoMulter = (maxSize) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === "video/mp4") {
        cb(null, true);
      } else {
        cb(new Error("Only mp4 files are allowed"), false);
      }
    },
  });
};

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: `File too large. Maximum size is ${req.videoType === "short" ? "50MB" : "200MB"}`,
      });
    }
  }
  if (err.message === "Only mp4 files are allowed") {
    return res.status(400).json({ error: "Only MP4 files are allowed" });
  }
  next(err);
};

const dynamicVideoUpload = (req, res, next) => {
  const videoType = req.query.type || req.body.type;

  if (!videoType || !["short", "long"].includes(videoType)) {
    return res.status(400).json({
      error: "Video type is required. Use ?type=short or ?type=long",
    });
  }

  const maxSize = videoType === "short" ? 50 * 1024 * 1024 : 200 * 1024 * 1024;

  req.videoType = videoType;

  const upload = createVideoMulter(maxSize);
  upload.single("video")(req, res, next);
};

module.exports = {
  generateToken,
  verifyToken,
  handleMulterError,
  createVideoMulter,
  dynamicVideoUpload,
};
