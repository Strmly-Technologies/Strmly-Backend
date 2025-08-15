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
    custom_name:{
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 50,
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
      //all communities
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Community',
      default: [],
    },
    following_communities: {
      //user following/joined communities
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
      //user created Communities
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Community',
      default: [],
    },
    history: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    content_interests: {
      type: String,
    },
    watch_time: {
      type: Number,
      default: 0,
    },
    advertisement_earnings: {
      type: Number,
      default: 0,
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
    FCM_token: {
      type: String,
      default: '',
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
    interest1: {
      type: [String],
      default: [],
    },
    interest2: {
      type: [String],
      default: [],
    },
    viewed_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'LongVideo',
      default: [],
    },
    recommendation_settings: {
      last_recommendation_reset: {
        type: Date,
        default: Date.now,
      },
      recommendation_batch_size: {
        type: Number,
        default: 5,
      },
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
    comment_monetization_enabled: { type: Boolean, default: false },

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
      upi_id: {
        type: String,
        default: null,
      },
      upi_fund_account_id: {
        type: String,
        default: null,
      },
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
      creator_pass_deletion: {
        deletion_requested: {
          type: Boolean,
          default: false,
        },
        deletion_requested_at: {
          type: Date,
          default: null,
        },
        deletion_reason: {
          type: String,
          default: null,
        },
        deletion_eligible_at: {
          type: Date,
          default: null,
        },
        last_subscriber_expires_at: {
          type: Date,
          default: null,
        },
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
      reset_otp: {
        type: String,
        default: null,
      },
      reset_otp_expires: {
        type: Date,
        default: null,
      },
      reset_requested_at: {
        type: Date,
        default: null,
      },
    },
    social_media_links: {
      facebook: {
        type: String,
        trim: true,
      },
      twitter: {
        type: String,
        trim: true,
      },
      instagram: {
        type: String,
        trim: true,
      },
      youtube: {
        type: String,
        trim: true,
      },
      snapchat: {
        type: String,
        trim: true,
      },
    },
    drafts: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Draft',
      default: [],
    },
    account_status: {
      is_deactivated: {
        type: Boolean,
        default: false,
      },
      deactivated_at: {
        type: Date,
        default: null,
      },
      deactivation_reason: {
        type: String,
        default: null,
      },
    },
    deletion_requested: {
      type: Boolean,
      default: false,
    },
    deletion_requested_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

userSchema.methods.deactivateAccount = function (reason = null) {
  this.account_status.is_deactivated = true
  this.account_status.deactivated_at = new Date()
  this.account_status.deactivation_reason = reason
  return this.save()
}

userSchema.methods.reactivateAccount = function () {
  this.account_status.is_deactivated = false
  this.account_status.deactivated_at = null
  this.account_status.deactivation_reason = null
  return this.save()
}

userSchema.methods.isDeactivated = function () {
  return this.account_status.is_deactivated === true
}

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
