const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      // unique: true,
      trim: true,
      minlength: 2,
      maxlength: 20,
    },
    profile_photo: {
      type: String,
      default: "",
    },
    founder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    followers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    creators: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    long_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "LongVideo",
      default: [],
    },
    short_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "ShortVideo",
      default: [],
    },
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

const Community = mongoose.model("Community", communitySchema);

module.exports = Community;
