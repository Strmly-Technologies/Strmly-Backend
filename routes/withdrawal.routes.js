const router = require("express").Router();
const {
  createWithdrawalRequest,
  getWithdrawalHistory,
  checkWithdrawalStatus,
} = require("../controller/withdrawal.controller");
const { setupCreatorBankAccount } = require("../controller/creator.controller");
const { authenticateToken } = require("../middleware/auth");

// Setup bank account for withdrawals
router.post("/setup-bank", authenticateToken, setupCreatorBankAccount);

// Create withdrawal request
router.post("/create", authenticateToken, createWithdrawalRequest);

// Get withdrawal history
router.get("/history", authenticateToken, getWithdrawalHistory);

// Check specific withdrawal status
router.get("/status/:withdrawalId", authenticateToken, checkWithdrawalStatus);

module.exports = router;