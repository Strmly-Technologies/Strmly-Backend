const User = require('../models/User')
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

    const newUser = new User({
      username,
      email,
      password,
    })

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
}
