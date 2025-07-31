const mongoose = require('mongoose')

const draftSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content_type: {
      type: String,
      enum: ['video', 'series'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'uploading', 'processing', 'failed', 'completed'],
      default: 'draft',
    },
    draft_data: {
      // Video metadata
      name: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      description: {
        type: String,
        trim: true,
        maxlength: 500,
      },
      genre: {
        type: String,
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
        enum: ['Free', 'Paid'],
      },
      language: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      age_restriction: {
        type: Boolean,
        default: false,
      },
      start_time: {
        type: Number,
        default: 0,
      },
      display_till_time: {
        type: Number,
        default: 0,
      },
      community_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Community',
      },
      series_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Series',
      },
    },
    // Video file information
    video_data: {
      has_video: {
        type: Boolean,
        default: false,
      },
      video_url: {
        type: String,
        default: null,
      },
      video_s3_key: {
        type: String,
        default: null,
      },
      thumbnail_url: {
        type: String,
        default: null,
      },
      thumbnail_s3_key: {
        type: String,
        default: null,
      },
      original_filename: {
        type: String,
        default: null,
      },
      file_size: {
        type: Number,
        default: null,
      },
      video_uploaded_at: {
        type: Date,
        default: null,
      },
    },
    error_message: {
      type: String,
      default: null,
    },
    last_modified: {
      type: Date,
      default: Date.now,
    },
    expires_at: {
      type: Date,
      default: function() {
        // If draft has video, expire in 7 days, otherwise 30 days
        const days = this.video_data?.has_video ? 7 : 30;
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      },
      index: { expireAfterSeconds: 0 }
    },
  },
  { 
    timestamps: true,
    indexes: [
      { user_id: 1, status: 1 },
      { user_id: 1, content_type: 1 },
      { status: 1 },
      { expires_at: 1 },
      { 'video_data.has_video': 1 }
    ]
  }
)

// Update last_modified on save
draftSchema.pre('save', function(next) {
  this.last_modified = new Date();
  next();
});

// Method to check if draft is expired
draftSchema.methods.isExpired = function() {
  return new Date() > this.expires_at;
};

// Method to extend expiry
draftSchema.methods.extendExpiry = function(days = 30) {
  this.expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

// Method to update expiry when video is added
draftSchema.methods.updateExpiryForVideo = function() {
  this.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  this.video_data.video_uploaded_at = new Date();
  return this.save();
};

// Method to check if video has expired (7 days for video drafts)
draftSchema.methods.isVideoExpired = function() {
  if (!this.video_data?.has_video) return false;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.video_data.video_uploaded_at < sevenDaysAgo;
};

const Draft = mongoose.model('Draft', draftSchema)

module.exports = Draft
