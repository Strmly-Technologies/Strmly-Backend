const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Access token required" });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }

    req.user = { ...user.toObject(), id: user._id };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  authenticateToken,
};
