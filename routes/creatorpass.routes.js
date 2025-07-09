const express = require("express");
const router = express.Router();
const {
  createCreatorPassOrder,
  verifyCreatorPassPayment,
  getCreatorPassStatus,
  cancelCreatorPass,
} = require("../controller/creatorpass.controller");
const { authenticateToken } = require("../middleware/auth");

// Create creator pass order
router.post("/create-order", authenticateToken, createCreatorPassOrder);

// Verify payment and activate creator pass
router.post("/verify-payment", authenticateToken, verifyCreatorPassPayment);

// Get creator pass status for a specific creator
router.get("/status/:creatorId", authenticateToken, getCreatorPassStatus);

// Cancel creator pass
router.post("/cancel/:creatorId", authenticateToken, cancelCreatorPass);

module.exports = router;
