const mongoose = require('mongoose')

const userAccessSchema = new mongoose.Schema(
  {
    user_id: {
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
      enum: ['series', 'video', 'creator', 'Series'], // Added 'video' and 'creator'
    },
    access_type: {
      type: String,
      required: true,
      enum: ['free', 'paid', 'subscription', 'creator_pass'], // Added missing types
      default: 'paid',
    },
    payment_method: {
      type: String,
      enum: ['wallet_transfer', 'creator_pass', 'gift'],
    },
    payment_amount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Object,
      default: {},
    },
    expires_at: {
      type: Date,
      default: null,
    },
    granted_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
)

userAccessSchema.index(
  { user_id: 1, content_id: 1, content_type: 1 },
  { unique: true }
)

const UserAccess = mongoose.model('UserAccess', userAccessSchema)
module.exports = UserAccess
