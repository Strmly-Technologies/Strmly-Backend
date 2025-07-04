const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    transaction_type: {
      type: String,
      required: true,
      enum: ["credit", "debit"],
    },
    transaction_category: {
      type: String,
      required: true,
      enum: [
        "wallet_load",        // User loads money from bank
        "series_purchase",    // User buys series
        "creator_earning",    // Creator receives 70%
        "platform_commission", // Platform gets 30%
        "withdrawal_request", // Creator withdraws
        "refund"
      ],
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    balance_before: {
      type: Number,
      required: true,
    },
    balance_after: {
      type: Number,
      required: true,
    },
    content_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    content_type: {
      type: String,
      enum: ["Series", "LongVideo","series"],
    },
    transfer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransfer",
    },
    razorpay_payment_id: {
      type: String,
    },
    razorpay_order_id: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "completed",
    },
    metadata: {
      series_title: String,
      creator_name: String,
      platform_fee: Number,
      creator_share: Number,
    },
  },
  { timestamps: true }
);

// Indexes for better performance
walletTransactionSchema.index({ wallet_id: 1, createdAt: -1 });
walletTransactionSchema.index({ user_id: 1, transaction_type: 1 });
walletTransactionSchema.index({ transaction_category: 1, createdAt: -1 });

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
module.exports = WalletTransaction;
