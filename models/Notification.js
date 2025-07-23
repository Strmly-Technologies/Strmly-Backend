const mongoose = require('mongoose')

const NotificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  from_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['video like', 'video comment', 'video reshare', 'comment upvote', 'comment like', 'comment gift', 'comment reply']
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'LongVideo' },
    commentId: { type: mongoose.Schema.Types.ObjectId },
    replyId: { type: mongoose.Schema.Types.ObjectId },
    commentText: String,
    replyText: String,
    avatar: String,
    URL: String
  },
  group: {
    type: String,
    enum: ['revenue', 'non-revenue'],
    required: true
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
})

// Compound index for efficient queries
NotificationSchema.index({ user_id: 1, created_at: -1 })
NotificationSchema.index({ user_id: 1, read: 1 })

module.exports = mongoose.model('Notification', NotificationSchema)
