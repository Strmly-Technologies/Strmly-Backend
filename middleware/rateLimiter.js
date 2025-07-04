const rateLimit = require("express-rate-limit");

const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: "Too many payment requests from this IP, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many payment requests from this IP, please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

const withdrawalRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: "Too many withdrawal requests from this IP, please try again later.",
    code: "WITHDRAWAL_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many withdrawal requests from this IP, please try again later.",
      code: "WITHDRAWAL_RATE_LIMIT_EXCEEDED",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many requests from this IP, please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

const bankSetupRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: "Too many bank setup attempts from this IP, please try again tomorrow.",
    code: "BANK_SETUP_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many bank setup attempts from this IP, please try again tomorrow.",
      code: "BANK_SETUP_RATE_LIMIT_EXCEEDED",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

module.exports = {
  paymentRateLimiter,
  withdrawalRateLimiter,
  generalRateLimiter,
  bankSetupRateLimiter,
};
