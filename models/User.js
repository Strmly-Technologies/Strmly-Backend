const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const userSchema = new mongoose.Schema(
  {
    is_google_user: {
      type: Boolean,
      default: false,
      select: false,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    saved_items: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Community',
      default: [],
    },
    saved_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    saved_series: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Series',
      default: [],
    },
    profile_photo: {
      type: String,
      default: '',
    },
    followers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    community: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Community',
      default: [],
    },
    following: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    my_communities: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Community',
      default: [],
    },
    history: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    bio: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    liked_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    commented_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    replied_comments: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Comment',
      default: [],
    },
    shared_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    video_frame: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    date_of_birth: {
      type: Date,
    },
    interests: {
      type: [String],
      default: [],
    },
    liked_communities: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Community',
      default: [],
    },
    already_watched_long_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    creator_profile: {
      bank_details: {
        account_number: String,
        ifsc_code: String,
        beneficiary_name: String,
        bank_name: String,
        account_type: {
          type: String,
          enum: ['savings', 'current'],
          default: 'savings',
        },
      },
      fund_account_id: String,
      withdrawal_enabled: {
        type: Boolean,
        default: false,
      },
      bank_verified: {
        type: Boolean,
        default: false,
      },
      total_earned: {
        type: Number,
        default: 0,
      },
      verification_status: {
        type: String,
        enum: ['unverified', 'pending', 'verified'],
        default: 'unverified',
      },
      creator_pass_price: {
        type: Number,
        default: 0,
        max: 10000,
      },
    },
    phone: {
      type: String,
      trim: true,
      match: /^[0-9]{10}$/,
    },
    onboarding_completed: {
      type: Boolean,
      default: false,
    },
    email_verification: {
      is_verified: {
        type: Boolean,
        default: false,
      },
      verification_otp: {
        type: String,
        default: null,
      },
      verification_otp_expires: {
        type: Date,
        default: null,
      },
      verification_sent_at: {
        type: Date,
        default: null,
      },
    },
    password_reset: {
      reset_token: {
        type: String,
        default: null,
      },
      reset_token_expires: {
        type: Date,
        default: null,
      },
      reset_requested_at: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
)

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()

  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

const User = mongoose.model('User', userSchema)

module.exports = User
