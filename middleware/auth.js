const { verifyToken } = require('../utils/jwt')
const {OAuth2Client}=require("google-auth-library")
const User = require('../models/User')

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ message: 'Access token required' })
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return res.status(403).json({ message: 'Invalid or expired token' })
    }

    const user = await User.findById(decoded.userId).select('-password')
    if (!user) {
      return res.status(403).json({ message: 'User not found' })
    }
    // TODO: Uncomment this later
    // if (!user.email_verification.is_verified) {
    //   return res.status(403).json({ 
    //     message: 'Email verification required',
    //     code: 'EMAIL_NOT_VERIFIED',
    //     email: user.email,
    //   })
    // }

    req.user = { ...user.toObject(), id: user._id }
    next()
  } catch (error) {
    console.error('Authentication error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

const parseGoogleOAuthToken = async (req, res, next) => {
  try{
  const {credential,clientId,select_by}=req.body
  if(!credential || !clientId || !select_by){
  return res.status(400).json({ message: 'Malformed Id token' })
  }
  const googleClientId=process.env.GOOGLE_CLIENT_ID
  if(!googleClientId){
   throw new Error("Google credentials not set in environment")
  }
   const client = new OAuth2Client(googleClientId);

   const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
   });
    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    const { email, name, picture } = payload;
    if (!email || !name) {
      return res.status(403).json({ message: 'Email and name required' });
    }
    req.googleUser = { email, name, picture };
    next();
  }catch(error){
    console.error('Authentication error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}



module.exports = {
  authenticateToken,
  parseGoogleOAuthToken
}
