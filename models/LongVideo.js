const mongoose = require('mongoose')

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
    comments: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          comment: { type: String, required: true, trim: true, maxlength: 500 },
          likes: { type: Number, default: 0 },
          upvotes: { type: Number, default: 0 },
          downvotes: { type: Number, default: 0 },
          donations: { type: Number, default: 0 },
          upvoted_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
          downvoted_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
          replies: [
            {
              user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
              reply: {
                type: String,
                required: true,
                trim: true,
                maxlength: 500,
              },
              likes: { type: Number, default: 0 },
              upvotes: { type: Number, default: 0 },
              downvotes: { type: Number, default: 0 },
              donations: { type: Number, default: 0 },
              upvoted_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
              downvoted_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
              replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
              createdAt: { type: Date, default: Date.now },
            },
          ],
          default: [],
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
    liked_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    videoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnailUrl: {
      type: String,
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
      required: true,
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
