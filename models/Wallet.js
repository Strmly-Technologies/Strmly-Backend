const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    wallet_type: {
      type: String,
      enum: ["user", "creator"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "frozen", "suspended"],
      default: "active",
    },
    total_loaded: {
      type: Number,
      default: 0,
    },
    total_spent: {
      type: Number,
      default: 0,
    },
    total_received: {
      type: Number,
      default: 0,
    },
    total_withdrawn: {
      type: Number,
      default: 0,
    },
    last_transaction_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

walletSchema.index({ user_id: 1 });
walletSchema.index({ wallet_type: 1, status: 1 });

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;