const User = require('../models/User')
const { generateVerificationToken, sendVerificationEmail, sendWelcomeEmail } = require('../utils/email')
const { generateToken } = require('../utils/jwt')
const { handleError } = require('../utils/utils')

const RegisterNewUser = async (req, res, next) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'All fields are required' })
  }

  try {
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' })
    }

    let username = await User.findOne({ username: email.split('@')[0] })
    if (!username) {
      username = email.split('@')[0]
    } else {
      username = username.username + Math.floor(Math.random() * 100000)
    }

    //generate a verification token
    const verificationToken = generateVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    const newUser = new User({
      username,
      email,
      password,
      email_verification:{
        is_verified:false,
        verification_token: verificationToken,
        verification_token_expires: verificationTokenExpires,
        verification_sent_at: new Date(),
      }
    });

    await newUser.save()

    const emailResult=await sendVerificationEmail(email,username,verificationToken);
    if(!emailResult.success){
      return res.status(500).json({ message: 'Failed to send verification email' })
    }
    const token = generateToken(newUser._id)

    res.status(201).json({
      message: 'User registered successfully.Please check your email to verify your account',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        email_verified: false,
      },
     verification: {
        email_sent: emailResult.success,
        message: emailResult.success 
          ? 'Verification email sent successfully' 
          : 'Registration completed but verification email failed to send',
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const verifyEmail=async(req,res,next)=>{
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'Verification token is required' })
  }
  try {
    const user=await User.findOne({
      'email_verification.verification_token': token,
      'email_verification.verification_token_expires': { $gt: new Date() },
    })
    if(!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' })
    }

    if(user.email_verification.is_verified){
      return res.status(400).json({ message: 'Email is already verified' })
    } 
    user.email_verification.is_verified = true;
    user.email_verification.verification_token = null;
    user.email_verification.verification_token_expires = null;
    await user.save();

    await sendWelcomeEmail(user.email, user.username);
   res.status(200).json({
      message: 'Email verified successfully! You can now sign in.',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        email_verified: true,
      },
      redirect: '/login',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const resendVerificationEmail = async (req, res, next) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.email_verification.is_verified) {
      return res.status(400).json({ 
        message: 'Email is already verified',
        code: 'ALREADY_VERIFIED'
      })
    }

    // Check if we can resend (rate limiting)
    const lastSent = user.email_verification.verification_sent_at
    if (lastSent && new Date() - lastSent < 60000) { // 1 minute cooldown
      return res.status(429).json({ 
        message: 'Please wait before requesting another verification email',
        code: 'RATE_LIMITED'
      })
    }

    // Generate new token
    const verificationToken = generateVerificationToken()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    user.email_verification.verification_token = verificationToken
    user.email_verification.verification_token_expires = verificationExpires
    user.email_verification.verification_sent_at = new Date()
    await user.save()

    // Send verification email
    const emailResult = await sendVerificationEmail(user.email, user.username, verificationToken)

    if (!emailResult.success) {
      return res.status(500).json({ 
        message: 'Failed to send verification email',
        code: 'EMAIL_SEND_FAILED'
      })
    }

    res.status(200).json({
      message: 'Verification email sent successfully',
      email_sent: true,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const LoginUserWithEmail = async (req, res, next) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  try {
    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }
    if (!user.email_verification.is_verified) {
      return res.status(403).json({ 
        message: 'Please verify your email before signing in',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
        can_resend: true,
      })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }

    const token = generateToken(user._id)

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const LoginUserWithUsername = async (req, res, next) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: 'Username and password are required' })
  }

  try {
    const user = await User.findOne({ username }).select('+password')
    if (!user) {
      return res.status(400).json({ message: 'Invalid username or password' })
    }
    if (!user.email_verification.is_verified) {
      return res.status(403).json({ 
        message: 'Please verify your email before signing in',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
        can_resend: true,
      })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid username or password' })
    }

    const token = generateToken(user._id)

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const RegisterUserWithGoogle = async (req, res, next) => {
const { email,picture } = req.googleUser; 
if(!email){
  return res.status(401).json({ message: 'Malformed google Id-token' })
}

  try {
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' })
    }

    let username = await User.findOne({ username: email.split('@')[0] })
    if (!username) {
      username = email.split('@')[0]
    } else {
      username = username.username + Math.floor(Math.random() * 100000)
    }

    const newUser = new User({
      username,
      email,
      is_google_user:true,
    })

    if(picture){
      newUser.profile_photo=picture;
    }

    await newUser.save()

    const token = generateToken(newUser._id)

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}


const LoginUserWithGoogle = async (req, res, next) => {
  const { email} = req.googleUser; 

  if (!email) {
    return res
      .status(400)
      .json({ message: 'Malformed google Id-token' })
  }

  try {
    const user = await User.findOne({ email }).select('+is_google_user')
    if (!user) {
      return res.status(400).json({ message: 'Invalid email' })
    }

    if (!user.is_google_user) {
      return res.status(400).json({ message: 'Email is not linked with a google account' })
    }

    const token = generateToken(user._id)

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}




const LogoutUser = (req, res) => {
  // Remove the token on the client side
  res.status(200).json({ message: 'User logged out successfully' })
}

const RefreshToken = async (req, res, next) => {
  try {
    const token = generateToken(req.user._id)

    res.status(200).json({
      message: 'Token refreshed successfully',
      token,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  RegisterNewUser,
  LoginUserWithEmail,
  LoginUserWithUsername,
  LogoutUser,
  RefreshToken,
  RegisterUserWithGoogle,
  LoginUserWithGoogle,
  verifyEmail,
  resendVerificationEmail,
}
