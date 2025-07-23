const mongoose = require('mongoose')
const { Schema } = mongoose
const longVideoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
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
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
    liked_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    videoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    videoResolutions: {
      type: Map,
      of: new Schema(
        {
          url: { type: String, required: true },
          key: { type: String, required: true },
        },
        { _id: false }
      ),
      default: {},
    },
    thumbnailUrl: {
      type: String,
      required: false,
      trim: true,
    },
    series: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Series',
      default: null,
    },
    episode_number: {
      type: Number,
      default: null,
    },
    season_number: {
      type: Number,
      default: 1,
    },
    is_standalone: {
      type: Boolean,
      default: true,
    },
    age_restriction: {
      type: Boolean,
      default: false,
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
    type: {
      type: String,
      required: true,
      enum: ['Free', 'Paid'],
    },
    Videolanguage: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
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
    start_time:{
      type: Number,
      default: 0,
    },
    display_till_time:{
      type: Number,
      default: 0,
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'hidden'],
      default: 'public'
  },
     hidden_reason: {
      type: String,
      enum: ['account_deactivated', 'user_request', 'admin_action'],
      default: null
  },
    hidden_at: {
     type: Date,
     default: null
  }

  },
  { timestamps: true }
)

longVideoSchema.index({ community: 1, genre: 1 })
longVideoSchema.index({ series: 1, season_number: 1, episode_number: 1 })
longVideoSchema.index({ created_by: 1 })
longVideoSchema.index({ is_standalone: 1 })
longVideoSchema.index({ name: 'text', description: 'text' })

longVideoSchema.pre('save', function (next) {
  if (!this.is_standalone) {
    if (!this.series || !this.episode_number) {
      return next(
        new Error(
          'Series and episode number are required for non-standalone videos'
        )
      )
    }
  } else {
    this.series = null
    this.episode_number = null
    this.season_number = 1
  }
  next()
})

const LongVideo = mongoose.model('LongVideo', longVideoSchema)

module.exports = LongVideo
