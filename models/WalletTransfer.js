const mongoose = require('mongoose')

const walletTransferSchema = new mongoose.Schema(
  {
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sender_wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    receiver_wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    creator_amount: {
      type: Number,
      required: true,
    },
    platform_amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
    },
    transfer_type: {
      type: String,
      required: true,
      enum: [
        'series_purchase',
        'video_purchase',
        'tip',
        'gift',
        'comment_gift',
        'community_fee',
      ],
    },
    content_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    content_type: {
      type: String,
      enum: [
        'Series',
        'LongVideo',
        'ShortVideo',
        'series',
        'comment',
        'Community',
      ],
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
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'completed',
    },
    platform_fee_percentage: {
      type: Number,
      default: 30,
    },
    creator_share_percentage: {
      type: Number,
      default: 70,
    },
    source_payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    metadata: {
      series_title: String,
      video_title: String,
      creator_name: String,
      transfer_note: String,
      comment_id: String,
      comment_text: String,
      video_id: String,
      community_name: String,
      founder_name: String,
    },
  },
  { timestamps: true }
)

walletTransferSchema.index({ sender_id: 1, createdAt: -1 })
walletTransferSchema.index({ receiver_id: 1, createdAt: -1 })
walletTransferSchema.index({ content_id: 1, content_type: 1 })

const WalletTransfer = mongoose.model('WalletTransfer', walletTransferSchema)
module.exports = WalletTransfer
