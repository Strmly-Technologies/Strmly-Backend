const router = require('express').Router()
const {
  RegisterNewUser,
  LoginUserWithEmail,
  LoginUserWithUsername,
  LogoutUser,
  RefreshToken,
  LoginUserWithGoogle,
  RegisterUserWithGoogle
} = require('../controller/auth.controller')
const { authenticateToken,parseGoogleOAuthToken} = require('../middleware/auth')

// Register a new user
router.post('/register', RegisterNewUser)

// Login an existing user using email
router.post('/login/email', LoginUserWithEmail)

// Login an existing user using username
router.post('/login/username', LoginUserWithUsername)

//Register a new user using google OAuth2
router.post('/register/google',parseGoogleOAuthToken,RegisterUserWithGoogle)

//Login an existing user using google OAuth2
router.post('/login/google',parseGoogleOAuthToken,LoginUserWithGoogle)

// Logout a user
router.post('/logout', LogoutUser)

// Refresh JWT token (protected route)
router.post('/refresh', authenticateToken, RefreshToken)

module.exports = router
