const mongoose = require('mongoose')

const communityAccessSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    community_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
    },
    access_type: {
      type: String,
      enum: ['free', 'paid'],
      required: true,
    },
    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransfer',
    },
    payment_amount: {
      type: Number,
      default: 0,
    },
    payment_date: {
      type: Date,
      default: Date.now,
    },
    expires_at: {
      type: Date,
      required: function() {
        return this.access_type === 'paid'
      },
    },
    auto_renewal: {
      type: Boolean,
      default: false,
    },
    subscription_status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    upload_permissions: {
      videos_uploaded: {
        type: Number,
        default: 0,
      },
      last_upload: {
        type: Date,
      },
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked'],
      default: 'active',
    },
    granted_at: {
      type: Date,
      default: Date.now,
    },
    last_renewal: {
      type: Date,
    },
  },
  { timestamps: true }
)

// Method to check if access is expired
communityAccessSchema.methods.isExpired = function() {
  if (this.access_type === 'free') return false
  return this.expires_at && new Date() > this.expires_at
}

// Method to extend subscription by 30 days
communityAccessSchema.methods.renewSubscription = function() {
  if (this.access_type === 'paid') {
    const now = new Date()
    this.expires_at = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
    this.last_renewal = now
    this.subscription_status = 'active'
    this.status = 'active'
  }
  return this.save()
}

// Pre-save hook to set expiry date for paid access
communityAccessSchema.pre('save', function(next) {
  if (this.isNew && this.access_type === 'paid' && !this.expires_at) {
    // Set expiry to 30 days from now for new paid access
    this.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }
  next()
})

// Compound index for efficient queries
communityAccessSchema.index({ user_id: 1, community_id: 1 }, { unique: true })
communityAccessSchema.index({ community_id: 1, access_type: 1 })
communityAccessSchema.index({ expires_at: 1 })

const CommunityAccess = mongoose.model('CommunityAccess', communityAccessSchema)
module.exports = CommunityAccess
