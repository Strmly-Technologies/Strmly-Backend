const mongoose = require('mongoose')

const shortVideoSchema = new mongoose.Schema(
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
    },
  },
  { timestamps: true }
)

shortVideoSchema.index({ community: 1 })
shortVideoSchema.index({ created_by: 1 })
shortVideoSchema.index({ name: 'text', description: 'text' })

const ShortVideo = mongoose.model('ShortVideo', shortVideoSchema)

module.exports = ShortVideo
