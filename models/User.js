const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
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
      match: /.+\@.+\..+/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    saved_items: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Item",
      default: [],
    },
    saved_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Video",
      default: [],
    },
    profile_photo: {
      type: String,
      default: "",
    },
    followers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    community: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Community",
      default: [],
    },
    following: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    my_communities: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Community",
      default: [],
    },
    playlist: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Video",
      default: [],
    },
    history: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Video",
      default: [],
    },
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    liked_videos: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Video",
      default: [],
    },
    video_frame: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Video",
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
