const router = require("express").Router();
const { LikeVideo, ShareVideo, CommentOnVideo } = require("../controller/interaction.controller");
const { authenticateToken } = require("../middleware/auth");

// API to like a video
router.post("/like", authenticateToken, LikeVideo);

// API to share a video
router.post("/share", authenticateToken, ShareVideo);

// API to comment on a video
router.post("/comment", authenticateToken, CommentOnVideo);

module.exports = router;
