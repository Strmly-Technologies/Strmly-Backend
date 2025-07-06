const mongoose = require("mongoose");

const communityAccessSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    community_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },
    access_type: {
      type: String,
      enum: ["free", "paid"],
      required: true,
    },
    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransfer",
    },
    payment_amount: {
      type: Number,
      default: 0,
    },
    payment_date: {
      type: Date,
    },
    upload_permissions: {
      videos_uploaded: {
        type: Number,
        default: 0,
      },
      last_upload: {
        type: Date,
      },
    },
    status: {
      type: String,
      enum: ["active", "expired", "revoked"],
      default: "active",
    },
    granted_at: {
      type: Date,
      default: Date.now,
    },
    expires_at: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Compound index for efficient queries
communityAccessSchema.index({ user_id: 1, community_id: 1 }, { unique: true });
communityAccessSchema.index({ community_id: 1, access_type: 1 });

const CommunityAccess = mongoose.model("CommunityAccess", communityAccessSchema);
module.exports = CommunityAccess;
