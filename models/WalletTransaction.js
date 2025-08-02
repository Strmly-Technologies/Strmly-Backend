const mongoose = require('mongoose')

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    transaction_type: {
      type: String,
      required: true,
      enum: ['credit', 'debit'],
    },
    transaction_category: {
      type: String,
      required: true,
      enum: [
        'wallet_load',
        'series_purchase',
        'video_purchase',
        'video_gift',
        'creator_pass_purchase',
        'creator_earning',
        'platform_commission',
        'withdrawal_request',
        'refund',
        'comment_gift',
        'gift_received',
        'community_fee',
        'community_subscription',
        'community_fee_received',
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
      default: 'INR',
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
      enum: ['Series', 'LongVideo', 'series'],
    },
    transfer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransfer',
    },
    razorpay_payment_id: {
      type: String,
    },
    razorpay_order_id: {
      type: String,
    },

    google_product_id: {
      //frontend sets it
      type: String,
    },
    google_order_id: {
      //google sets it
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'completed',
    },
    metadata: {
      series_title: String,
      creator_name: String,
      platform_fee: Number,
      creator_share: Number,
      comment_id: String,
      comment_text: String,
      video_id: String,
      video_title: String,
      community_name: String,
      founder_name: String,
    },
  },
  { timestamps: true }
)

// Indexes for better performance
walletTransactionSchema.index({ wallet_id: 1, createdAt: -1 })
walletTransactionSchema.index({ user_id: 1, transaction_type: 1 })
walletTransactionSchema.index({ transaction_category: 1, createdAt: -1 })

const WalletTransaction = mongoose.model(
  'WalletTransaction',
  walletTransactionSchema
)
module.exports = WalletTransaction
