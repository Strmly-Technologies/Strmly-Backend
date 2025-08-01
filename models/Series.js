const mongoose = require('mongoose')

const seriesSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    promised_episode_count: {
      type: Number,
      required: true,
      min: 2,
    },
    locked_earnings: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    price: {
      type: Number,
      required: function () {
        return this.type === 'Paid'
      },
      min: 0,
      max: 10000,
      validate: {
        validator: function (value) {
          if (this.type === 'Free') {
            return value === 0 || value == null
          }
          return value > 0
        },
        message:
          'Price must be greater than 0 for paid series and 0 for free series',
      },
    },
    posterUrl: {
      type: String,
      required: false,
      trim: false,
    },
    bannerUrl: {
      type: String,
      trim: true,
      default: '',
    },
    genre: {
      type: String,
      required: true,
      enum: [
        'Action',
        'Comedy',
        'Drama',
        'Horror',
        'Sci-Fi',
        'Romance',
        'Documentary',
        'Thriller',
        'Fantasy',
        'Animation',
      ],
    },
    language: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    age_restriction: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      required: true,
      enum: ['Free', 'Paid'],
    },
    status: {
      type: String,
      required: true,
      enum: ['Ongoing', 'Completed', 'Cancelled', 'On Hold'],
      default: 'Ongoing',
    },
    total_episodes: {
      type: Number,
      default: 0,
    },
    episodes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LongVideo',
      },
    ],
    release_date: {
      type: Date,
      required: false,
    },
    seasons: {
      type: Number,
      default: 1,
      min: 1,
    },
    likes: {
      type: Number,
      default: 0,
    },
    shares: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    earned_till_date: {
      type: Number,
      default: 0,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: false,
    },
    followers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    total_earned: {
      type: Number,
      default: 0,
    },
    total_revenue: {
      type: Number,
      default: 0,
    },
    platform_commission: {
      type: Number,
      default: 0,
    },
    total_purchases: {
      type: Number,
      default: 0,
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
      total_reshares: {
        type: Number,
        default: 0,
      },
      followers_gained_through_series: {
        type: Number,
        default: 0,
      },
      engagement_rate: {
        type: Number,
        default: 0,
      },
      last_analytics_update: {
        type: Date,
        default: Date.now,
      },
      visibility: {
        type: String,
        enum: ['public', 'private', 'hidden'],
        default: 'public',
      },
      hidden_reason: {
        type: String,
        enum: [
          'account_deactivated',
          'user_request',
          'admin_action',
          'series_deleted',
        ],
        default: null,
      },
      hidden_at: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
)

// Add validation for price based on type
seriesSchema.pre('save', function (next) {
  if (this.type === 'Free') {
    this.price = 0
  } else if (this.type === 'Paid' && (!this.price || this.price <= 0)) {
    return next(new Error('Paid series must have a price greater than 0'))
  }
  next()
})

seriesSchema.index({ community: 1, genre: 1 })
seriesSchema.index({ created_by: 1 })
seriesSchema.index({ title: 'text', description: 'text' })
seriesSchema.index({ followers: 1 })

const Series = mongoose.model('Series', seriesSchema)

module.exports = Series
