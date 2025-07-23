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
        // Drafts expire after 30 days
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
      { expires_at: 1 }
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

const Draft = mongoose.model('Draft', draftSchema)

module.exports = Draft
