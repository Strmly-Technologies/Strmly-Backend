const LongVideo = require("../models/LongVideo");
const ShortVideo = require("../models/ShortVideos");
const { handleError } = require("../utils/utils");

const LikeVideo = async (req, res, next) => {
  const { videoId, videoType } = req.body;
  const userId = req.user.id;

  if (!videoId || !videoType) {
    return res.status(400).json({ message: "Video ID and video type are required" });
  }

  if (!["long", "short"].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long' or 'short'" });
  }

  try {
    const VideoModel = videoType === "long" ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    video.likes += 1;
    await video.save();

    const user = await User.findById(userId);
    if (!user.likedVideos.includes(videoId)) {
      user.likedVideos.push(videoId);
      await user.save();
    }

    res.status(200).json({ message: "Video liked successfully", likes: video.likes });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const ShareVideo = async (req, res, next) => {
  const { videoId, videoType } = req.body;
  const userId = req.user.id;

  if (!videoId || !videoType) {
    return res.status(400).json({ message: "Video ID and video type are required" });
  }

  if (!["long", "short"].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long' or 'short'" });
  }

  try {
    const VideoModel = videoType === "long" ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    video.shares += 1;
    await video.save();

    const user = await User.findById(userId);
    if (!user.sharedVideos.includes(videoId)) {
      user.sharedVideos.push(videoId);
      await user.save();
    }

    res.status(200).json({ message: "Video shared successfully", shares: video.shares });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const CommentOnVideo = async (req, res, next) => {
  const { videoId, videoType, comment } = req.body;
  const userId = req.user.id;

  if (!videoId || !videoType || !comment) {
    return res.status(400).json({ message: "Video ID, video type, and comment are required" });
  }

  if (!["long", "short"].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long' or 'short'" });
  }

  try {
    const VideoModel = videoType === "long" ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    video.comments.push({ user: userId, comment });
    await video.save();

    const user = await User.findById(userId);
    if (!user.commentedVideos.includes(videoId)) {
      user.commentedVideos.push(videoId);
      await user.save();
    }

    res.status(200).json({ message: "Comment added successfully", comments: video.comments.length });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = {
  LikeVideo,
  ShareVideo,
  CommentOnVideo,
};
