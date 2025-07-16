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
  },
  { timestamps: true }
)

// Add validation for revenue sharing percentages
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
