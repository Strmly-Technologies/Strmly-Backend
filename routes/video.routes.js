const router = require("express").Router();
const { uploadVideo } = require("../controller/video.controller");
const { dynamicVideoUpload, handleMulterError } = require("../utils/utils");
const { authenticateToken } = require("../middleware/auth");

// Middleware to handle dynamic video upload based on type
router.post("/upload",authenticateToken, dynamicVideoUpload, uploadVideo, handleMulterError);

module.exports = router;
