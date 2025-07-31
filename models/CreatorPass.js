const mongoose = require('mongoose')

const CreatorPassSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount_paid: {
      type: Number,
      required: true,
    },
    start_date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    end_date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    payment_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    razorpay_order_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    razorpay_payment_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    google_order_id: {
      //google sets it
      type: String,
      unique: true,
      sparse: true,
    },
    auto_renewal: {
      type: Boolean,
      default: false,
    },
    cancelled_at: {
      type: Date,
    },
    metadata: {
      purchase_platform: {
        type: String,
        default: 'web',
      },
      discount_applied: {
        type: Number,
        default: 0,
      },
      original_price: {
        type: Number,
      },
    },
  },
  {
    timestamps: true,
  }
)

// Index for efficient queries
CreatorPassSchema.index({ user_id: 1, creator_id: 1, status: 1 })
CreatorPassSchema.index({ end_date: 1 })

module.exports = mongoose.model('CreatorPass', CreatorPassSchema)
