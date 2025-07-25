const router = require('express').Router()
const {
  RegisterNewUser,
  LoginUserWithEmail,
  LoginUserWithUsername,
  LogoutUser,
  RefreshToken,
  LoginUserWithGoogle,
  RegisterUserWithGoogle,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  checkEmailExists,
  checkUsernameExists
} = require('../controller/auth.controller')
const { authenticateToken,parseGoogleOAuthToken} = require('../middleware/auth')

// Check if username exists
router.get('/check-username/:username', checkUsernameExists)

// Check if email exists
router.get('/check-email/:email', checkEmailExists)

// Register a new user
router.post('/register', RegisterNewUser)

// Verify email with OTP
router.post('/verify-email', verifyEmail)

// Resend verification OTP
router.post('/resend-verification', resendVerificationEmail)


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

//password reset routes
router.post('/forgot-password', forgotPassword)
router.post('/verify-reset-token', verifyResetToken)
router.post('/reset-password', resetPassword)

module.exports = router
