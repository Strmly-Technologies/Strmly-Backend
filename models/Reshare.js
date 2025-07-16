const mongoose = require('mongoose')

const ReshareSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    long_video: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LongVideo',
      required: true,
    },
  },
  { timestamps: true }
)

ReshareSchema.index({ user: 1, long_video: 1 }, { unique: true })
const Reshare = mongoose.model('Reshare', ReshareSchema)
module.exports = Reshare
