const router = require("express").Router();
const {
  FollowCommunity,
  CreateCommunity,
  RenameCommunity,
  ChangeCommunityProfilePhoto,
  AddLongVideoToCommunity,
  AddShortVideoToCommunity,
  AddBioToCommunity,
} = require("../controller/community.controller");
const { authenticateToken } = require("../middleware/auth");

// Create a new community
router.post("/create", authenticateToken, CreateCommunity);

// Rename a community
router.put("/rename", authenticateToken, RenameCommunity);

// Change profile photo of a community
router.put("/change-profile-photo", authenticateToken, ChangeCommunityProfilePhoto);

// Follow a community
router.post("/follow", authenticateToken, FollowCommunity);

// Add long video to community
router.post("/add-long-video", authenticateToken, AddLongVideoToCommunity);

// Add short video to community
router.post("/add-short-video", authenticateToken, AddShortVideoToCommunity);

// Add a bio to a community
router.put("/add-bio", authenticateToken, AddBioToCommunity);

module.exports = router;
