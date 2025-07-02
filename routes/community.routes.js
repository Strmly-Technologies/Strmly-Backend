const router = require("express").Router();
const {
  FollowCommunity,
  CreateCommunity,
  RenameCommunity,
  ChangeCommunityProfilePhoto,
  AddBioToCommunity,
} = require("../controller/community.controller");
const { authenticateToken } = require("../middleware/auth");

// API to create a community
router.post("/create", authenticateToken, CreateCommunity);

// API to rename a community
router.put("/rename", authenticateToken, RenameCommunity);

// API to change community profile photo
router.put("/change-profile-photo", authenticateToken, ChangeCommunityProfilePhoto);

// API to follow a community
router.post("/follow", authenticateToken, FollowCommunity);

// API to add bio to a community
router.put("/add-bio", authenticateToken, AddBioToCommunity);

module.exports = router;
