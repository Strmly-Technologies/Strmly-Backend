const mongoose = require('mongoose')

const seriesSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
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
  },
  { timestamps: true }
)

seriesSchema.index({ community: 1, genre: 1 })
seriesSchema.index({ created_by: 1 })
seriesSchema.index({ title: 'text', description: 'text' })

const Series = mongoose.model('Series', seriesSchema)

module.exports = Series
