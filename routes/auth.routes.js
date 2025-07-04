const router = require("express").Router();
const {
  RegisterNewUser,
  LoginUserWithEmail,
  LoginUserWithUsername,
  LogoutUser,
  RefreshToken,
} = require("../controller/auth.controller");
const { authenticateToken } = require("../middleware/auth");

// Register a new user
router.post("/register", RegisterNewUser);

// Login an existing user using email
router.post("/login/email", LoginUserWithEmail);

// Login an existing user using username
router.post("/login/username", LoginUserWithUsername);

// Logout a user
router.post("/logout", LogoutUser);

// Refresh JWT token (protected route)
router.post("/refresh", authenticateToken, RefreshToken);

module.exports = router;
