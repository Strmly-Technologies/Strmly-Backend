const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 100,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    
    razorpay_payout_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    fund_account_id: {
      type: String,
      required: true,
    },
    
    // Withdrawal status
    status: {
      type: String,
      enum: ["pending", "queued", "processing", "processed", "cancelled", "failed", "reversed"],
      default: "pending",
    },
    
    bank_details: {
      account_number: String,
      ifsc_code: String,
      beneficiary_name: String,
      bank_name: String,
    },
    
    wallet_balance_before: {
      type: Number,
      required: true,
    },
    wallet_balance_after: {
      type: Number,
      required: true,
    },
    
    platform_fee: {
      type: Number,
      default: 0,
    },
    razorpay_fee: {
      type: Number,
      default: 0,
    },
    final_amount: {
      type: Number,
      required: true,
    },
    
    requested_at: {
      type: Date,
      default: Date.now,
    },
    processed_at: {
      type: Date,
    },
    
    // Failure details
    failure_reason: {
      type: String,
    },
    
    reference_id: {
      type: String,
      unique: true,
    },
    internal_notes: {
      type: String,
    },
    
    utr: {
      type: String,
    },
  },
  { timestamps: true }
);

// Indexes
withdrawalSchema.index({ creator_id: 1, status: 1 });
withdrawalSchema.index({ razorpay_payout_id: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

module.exports = Withdrawal;