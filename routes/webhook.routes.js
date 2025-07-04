const router = require("express").Router();
const { handleRazorpayWebhook } = require("../controller/webhook.controller");

// Razorpay webhook endpoint (no authentication required)
router.post("/razorpay", handleRazorpayWebhook);

module.exports = router;
