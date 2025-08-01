const mongoose = require('mongoose')
const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 20,
    },
    profile_photo: {
      type: String,
      default: '',
    },
    founder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    followers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    creators: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    creator_join_order: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        joined_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    creator_limit: {
      type: Number,
      default: 10,
      min: 1,
      max: 10000,
    },
    long_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    series: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Series',
      default: [],
    },
    bio: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    tags: {
      type: [String],
      default: [],
      trim: true,
      maxlength: 100,
    },
    community_fee_type: {
      type: String,
      enum: ['free', 'paid'],
      default: 'free',
    },
    community_fee_amount: {
      type: Number,
      default: 0,
      min: 0,
      max: 5000,
    },
    community_fee_description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    total_fee_collected: {
      type: Number,
      default: 0,
    },
    total_uploads: {
      type: Number,
      default: 0,
    },
    revenue_sharing: {
      founder_percentage: {
        type: Number,
        default: 100,
        min: 0,
        max: 100,
      },
      platform_percentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
    },
    analytics: {
      total_likes: {
        type: Number,
        default: 0,
      },
      total_views: {
        type: Number,
        default: 0,
      },
      total_shares: {
        type: Number,
        default: 0,
      },
      total_revenue: {
        type: Number,
        default: 0,
      },
      total_content_earnings: {
        type: Number,
        default: 0,
      },
      last_analytics_update: {
        type: Date,
        default: Date.now,
      },
    },
  },
  { timestamps: true }
)

communitySchema.methods.getNextFounder = function (currentFounderId) {
  // Find current founder's position in the join order
  const currentFounderIndex = this.creator_join_order.findIndex(
    (entry) => entry.user.toString() === currentFounderId.toString()
  )

  if (currentFounderIndex === -1) {
    // Current founder not found in join order, return first creator
    return this.creator_join_order.length > 0
      ? this.creator_join_order[0].user
      : null
  }

  for (let i = 1; i < this.creator_join_order.length; i++) {
    const nextIndex = (currentFounderIndex + i) % this.creator_join_order.length
    const nextCreator = this.creator_join_order[nextIndex].user

    // Check if this creator is still active in the community
    if (this.creators.includes(nextCreator)) {
      return nextCreator
    }
  }

  // If no other active creators found, return null
  return null
}

communitySchema.methods.addCreatorToJoinOrder = function (userId) {
  // Check if user is already in join order
  const existingEntry = this.creator_join_order.find(
    (entry) => entry.user.toString() === userId.toString()
  )

  if (!existingEntry) {
    this.creator_join_order.push({
      user: userId,
      joined_at: new Date(),
    })
  }
}

communitySchema.methods.removeCreatorFromJoinOrder = function (userId) {
  this.creator_join_order = this.creator_join_order.filter(
    (entry) => entry.user.toString() !== userId.toString()
  )
}

communitySchema.pre('save', function (next) {
  if (
    this.revenue_sharing.founder_percentage +
      this.revenue_sharing.platform_percentage !==
    100
  ) {
    this.revenue_sharing.founder_percentage = 100
    this.revenue_sharing.platform_percentage = 0
  }
  next()
})

const Community = mongoose.model('Community', communitySchema)

module.exports = Community
