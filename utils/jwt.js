const jwt = require('jsonwebtoken')

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  })
}

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch (error) {
    console.error('JWT verification failed:', error)
    return null
  }
}



module.exports = {
  generateToken,
  verifyToken,
}
