const mongoose = require('mongoose')

const autoCopyrightSchema = new mongoose.Schema(
  {
    flagged_video_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LongVideo',
      required: true,
    },
    flagged_video_owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    flagged_video_url: {
      type: String,
      required: true,
    },
    flagged_video_fingerprint: {
      type: String,
      required: true,
    },
    matched_video_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LongVideo',
      required: true,
    },
    matched_video_url: {
      type: String,
      required: true,
    },
    matched_video_fingerprint: {
      type: String,
      required: true,
    },
    fingerprint_type: {
      type: String,
      enum: ['video_fingerprint', 'audio_fingerprint'],
      required: true,
    },
    action_taken:{
      type:String,
      enum: ['ignored', 'removed', 'hidden'],
      default: 'none',
    }
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('AutoCopyright', autoCopyrightSchema)
