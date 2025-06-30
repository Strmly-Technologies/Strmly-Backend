const mongoose = require("mongoose");

const longVideoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    likes: {
      type: Number,
      default: 0,
    },
    shares: {
      type: Number,
      default: 0,
    },
    comments: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          comment: { type: String, required: true, trim: true, maxlength: 500 },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    videoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      required: true,
      trim: true,
    },
    series_episode: {
      type: [
        {
          series: { type: mongoose.Schema.Types.ObjectId, ref: "Series" },
          episode: { type: Number, required: true },
        },
      ],
      required: true,
    },
    age_restriction: {
      type: Boolean,
      default: false,
    },
    genre: {
      type: String,
      required: true,
      enum: ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Romance", "Documentary", "Thriller", "Fantasy", "Animation"],
    },
    type: {
      type: String,
      required: true,
      enum: ["Free", "Paid"],
    },
    language: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    subtitles: {
      type: [
        {
          language: { type: String, required: true, trim: true, maxlength: 100 },
          url: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    earned_till_date: {
      type: Number,
      default: 0,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },
  },
  { timestamps: true }
);

const LongVideo = mongoose.model("LongVideo", longVideoSchema);

module.exports = LongVideo;
