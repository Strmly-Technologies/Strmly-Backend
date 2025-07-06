const mongoose = require("mongoose");
const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
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
    creator_limit: {
      type: Number,
      default: 10,
      min: 1,
      max: 10000,
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
    series: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Series",
      default: [],
    },
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    tags: {
      type: [String],
      default: [],
      trim: true,
      maxlength: 100,
    },
  },
  { timestamps: true }
);

const Community = mongoose.model("Community", communitySchema);

module.exports = Community;
