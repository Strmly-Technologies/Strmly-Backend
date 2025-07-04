const router = require("express").Router();
const {
  getWalletDetails,
  createWalletLoadOrder,
  verifyWalletLoad,
  transferToCreatorForSeries,
  getWalletTransactionHistory,
} = require("../controller/wallet.controller");
const { authenticateToken } = require("../middleware/auth");

// Get wallet details and recent transfers
router.get("/", authenticateToken, getWalletDetails);

// Load money from bank to wallet
router.post("/load/create-order", authenticateToken, createWalletLoadOrder);
router.post("/load/verify", authenticateToken, verifyWalletLoad);

// Transfer money from user wallet to creator wallet (70/30 split)
router.post("/transfer/series", authenticateToken, transferToCreatorForSeries);

// Get wallet transaction history
router.get("/transactions", authenticateToken, getWalletTransactionHistory);

module.exports = router;