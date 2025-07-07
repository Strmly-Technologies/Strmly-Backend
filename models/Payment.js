const mongoose = require('mongoose')

const paymentSchema = new mongoose.Schema(
  {
    razorpay_order_id: {
      type: String,
      required: true,
      unique: true,
    },
    razorpay_payment_id: {
      type: String,
      required: true,
      unique: true,
    },
    razorpay_signature: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
    },
    status: {
      type: String,
      required: true,
      enum: ['created', 'paid', 'failed', 'refunded'],
      default: 'created',
    },
    payment_for: {
      type: String,
      required: true,
      enum: ['series', 'standalone_video', 'subscription'],
      default: 'series',
    },
    paid_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    paid_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    content_type: {
      type: String,
      required: true,
      enum: ['series', 'standalone_video'],
    },
    payment_date: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      series_title: String,
      video_title: String,
      community_name: String,
    },
  },
  { timestamps: true }
)

paymentSchema.index({ paid_by: 1, status: 1 })
paymentSchema.index({ paid_to: 1, status: 1 })
paymentSchema.index({ razorpay_order_id: 1 })
paymentSchema.index({ content_id: 1, content_type: 1 })

const Payment = mongoose.model('Payment', paymentSchema)
module.exports = Payment
