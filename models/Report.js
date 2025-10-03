const mongoose = require('mongoose')

const reportSchema = new mongoose.Schema({
  reporter_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  content_type: {
    type: String,
    enum: ['video', 'user', 'community', 'comment'],
    required: true
  },
  reason: {
    type: String,
    enum: ['inappropriate_content', 'spam', 'harassment', 'copyright', 'hate_speech', 'violence','child_exploitation', 'other'],
    required: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending'
  },
  evidence_images:{
    type:[String],
    default:[]
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('Report', reportSchema)