const router = require("express").Router();
const { authenticateToken } = require("../middleware/auth");
const {
  GetUserFeed,
  GetUserProfile,
  UpdateUserProfile,
  GetUserCommunities,
  GetUserVideos,
  GetUserInteractions,
  GetUserEarnings,
  GetUserNotifications,
  UpdateUserInterests,
} = require("../controller/user.controller");

// Get user feed
router.get("/feed", authenticateToken, GetUserFeed);

// Get user profile
router.get("/profile", authenticateToken, GetUserProfile);

// Update user profile
router.put("/profile", authenticateToken, UpdateUserProfile);

// Get user communities
router.get("/communities", authenticateToken, GetUserCommunities);

// Get user videos
router.get("/videos", authenticateToken, GetUserVideos);

// Get user interactions
router.get("/interactions", authenticateToken, GetUserInteractions);

// Get user earnings
router.get("/earnings", authenticateToken, GetUserEarnings);

// Get user notifications
router.get("/notifications", authenticateToken, GetUserNotifications);

// Update user interests
router.put("/interests", UpdateUserInterests);

module.exports = router;
