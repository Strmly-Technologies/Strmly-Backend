const mongoose = require('mongoose')

const autoNSFWSchema = new mongoose.Schema(
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
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('AutoNSFW', autoNSFWSchema)
