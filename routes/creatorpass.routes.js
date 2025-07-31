const express = require("express");
const router = express.Router();
const {
  purchaseCreatorPassWithWallet,
  createCreatorPassOrder,
  verifyCreatorPassPayment,
  getCreatorPassStatus,
  cancelCreatorPass,
  requestCreatorPassDeletion,
  cancelCreatorPassDeletion,
  getCreatorPassDeletionStatus,
  getCreatorsEligibleForDeletion,
  manuallyDeleteCreatorPass,
} = require("../controller/creatorpass.controller");
const { authenticateToken } = require("../middleware/auth");

// New wallet-based purchase route
router.post("/purchase-with-wallet", authenticateToken, purchaseCreatorPassWithWallet);

// Deprecated Razorpay routes (kept for backward compatibility)
// Create creator pass order
router.post("/create-order", authenticateToken, createCreatorPassOrder);

// Verify payment and activate creator pass
router.post("/verify-payment", authenticateToken, verifyCreatorPassPayment);

// Get creator pass status for a specific creator
router.get("/status/:creatorId", authenticateToken, getCreatorPassStatus);

// Cancel creator pass
router.post("/cancel/:creatorId", authenticateToken, cancelCreatorPass);

// Request creator pass deletion
router.post("/request-deletion", authenticateToken, requestCreatorPassDeletion);

// Cancel creator pass deletion request (within 7 days)
router.post("/cancel-deletion", authenticateToken, cancelCreatorPassDeletion);

// Get creator pass deletion status
router.get("/deletion-status", authenticateToken, getCreatorPassDeletionStatus);

// Admin routes for manual deletion
router.get("/admin/eligible-for-deletion", authenticateToken, getCreatorsEligibleForDeletion);
router.delete("/admin/delete/:creatorId", authenticateToken, manuallyDeleteCreatorPass);

module.exports = router;
