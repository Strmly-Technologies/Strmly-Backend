const mongoose = require("mongoose");

const walletTransferSchema = new mongoose.Schema(
  {
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender_wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    receiver_wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    
    // Transfer details with 70/30 split
    total_amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    creator_amount: {
      type: Number,
      required: true, // 70% of total
    },
    platform_amount: {
      type: Number,
      required: true, // 30% of total
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    transfer_type: {
      type: String,
      required: true,
      enum: ["series_purchase", "video_purchase", "tip", "gift"],
    },
    
    // What was purchased
    content_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    content_type: {
      type: String,
      enum: ["Series", "LongVideo", "series"],
    },
    
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    
    sender_balance_before: {
      type: Number,
      required: true,
    },
    sender_balance_after: {
      type: Number,
      required: true,
    },
    receiver_balance_before: {
      type: Number,
      required: true,
    },
    receiver_balance_after: {
      type: Number,
      required: true,
    },
    
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "completed",
    },
    
    // Revenue split tracking
    platform_fee_percentage: {
      type: Number,
      default: 30, // 30% platform fee
    },
    creator_share_percentage: {
      type: Number,
      default: 70, // 70% to creator
    },
    
    source_payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    
    metadata: {
      series_title: String,
      video_title: String,
      creator_name: String,
      transfer_note: String,
    },
  },
  { timestamps: true }
);

// Indexes
walletTransferSchema.index({ sender_id: 1, createdAt: -1 });
walletTransferSchema.index({ receiver_id: 1, createdAt: -1 });
walletTransferSchema.index({ content_id: 1, content_type: 1 });

const WalletTransfer = mongoose.model("WalletTransfer", walletTransferSchema);
module.exports = WalletTransfer;