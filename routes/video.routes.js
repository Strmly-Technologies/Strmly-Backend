const router = require("express").Router();
const { uploadVideo } = require("../controller/video.controller");
const { dynamicVideoUpload, handleMulterError } = require("../utils/utils");

// Middleware to handle dynamic video upload based on type
router.post("/upload", dynamicVideoUpload, uploadVideo, handleMulterError);

module.exports = router;
