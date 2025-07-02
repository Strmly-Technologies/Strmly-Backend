const LongVideo = require("../models/LongVideo");
const ShortVideo = require("../models/ShortVideos");
const { handleError } = require("../utils/utils");

const LikeVideo = async (req, res, next) => {
  const { videoId } = req.body;
  const userId = req.user.id;

  if (!videoId) {
    return res.status(400).json({ message: "Video ID is required" });
  }

  try {
    let video = await ShortVideo.findById(videoId);

    if (!video) {
      video = await LongVideo.findById(videoId);
    }

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    if (video.likes.includes(userId)) {
      return res.status(400).json({ message: "You have already liked this video" });
    }

    video.likes.push(userId);
    await video.save();

    res.status(200).json({ message: "Video liked successfully", likes: video.likes.length });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const ShareVideo = async (req, res, next) => {
  const { videoId } = req.body;
  const userId = req.user.id;

  if (!videoId) {
    return res.status(400).json({ message: "Video ID is required" });
  }

  try {
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    if (video.shares.includes(userId)) {
      return res.status(400).json({ message: "You have already shared this video" });
    }

    video.shares.push(userId);
    await video.save();

    res.status(200).json({ message: "Video shared successfully", shares: video.shares.length });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const CommentOnVideo = async (req, res, next) => {
  const { videoId, comment } = req.body;
  const userId = req.user.id;

  if (!videoId || !comment) {
    return res.status(400).json({ message: "Video ID and comment are required" });
  }

  try {
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    video.comments.push({ userId, comment });
    await video.save();

    res.status(200).json({ message: "Comment added successfully", comments: video.comments });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = {
  LikeVideo,
  ShareVideo,
  CommentOnVideo,
};
