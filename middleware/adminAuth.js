const jwt = require('jsonwebtoken')

// Hardcoded admin credentials (in production, use environment variables)
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD,
}

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]

  // If no token, check for basic auth
  if (!token) {
    const basicAuth = req.headers.authorization
    if (basicAuth && basicAuth.startsWith('Basic ')) {
      const base64Credentials = basicAuth.split(' ')[1]
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
      const [username, password] = credentials.split(':')

      if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        req.admin = { username: 'admin' }
        return next()
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="Admin Area"')
    return res.status(401).json({ 
      success: false, 
      message: 'Admin authentication required' 
    })
  }

  // Verify JWT token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    if (decoded.admin && decoded.username === ADMIN_CREDENTIALS.username) {
      req.admin = decoded
      next()
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid admin token' 
      })
    }
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid admin token' 
    })
  }
}

const generateAdminToken = (username) => {
  return jwt.sign(
    { admin: true, username },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  )
}

module.exports = { authenticateAdmin, generateAdminToken, ADMIN_CREDENTIALS }
