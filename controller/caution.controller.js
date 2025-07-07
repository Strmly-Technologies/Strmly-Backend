const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const ShortVideo = require('../models/ShortVideos')
const Community = require('../models/Community')
const Series = require('../models/Series')
const { handleError } = require('../utils/utils')

const DeleteLongVideo = async (req, res, next) => {
  const { videoId } = req.params
  const userId = req.user.id

  try {
    const video = await LongVideo.findById(videoId)
    if (!video) {
      return res.status(404).json({ message: 'Video not found' })
    }

    if (!video.created_by.equals(userId)) {
      return res
        .status(403)
        .json({ message: 'You can only delete videos you created' })
    }

    await Community.updateMany(
      { long_videos: videoId },
      { $pull: { long_videos: videoId } }
    )

    await User.updateMany(
      {
        $or: [
          { saved_videos: videoId },
          { playlist: videoId },
          { history: videoId },
          { liked_videos: videoId },
          { video_frame: videoId },
        ],
      },
      {
        $pull: {
          saved_videos: videoId,
          playlist: videoId,
          history: videoId,
          liked_videos: videoId,
          video_frame: videoId,
        },
      }
    )

    await LongVideo.findByIdAndDelete(videoId)

    res.status(200).json({ message: 'Long video deleted successfully' })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const DeleteShortVideo = async (req, res, next) => {
  const { videoId } = req.params
  const userId = req.user.id

  try {
    const video = await ShortVideo.findById(videoId)
    if (!video) {
      return res.status(404).json({ message: 'Short video not found' })
    }

    if (!video.created_by.equals(userId)) {
      return res
        .status(403)
        .json({ message: 'You can only delete videos you created' })
    }

    await Community.updateMany(
      { short_videos: videoId },
      { $pull: { short_videos: videoId } }
    )

    await ShortVideo.findByIdAndDelete(videoId)

    res.status(200).json({ message: 'Short video deleted successfully' })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const DeleteUserProfile = async (req, res, next) => {
  const userId = req.user.id

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    await LongVideo.deleteMany({ created_by: userId })
    await ShortVideo.deleteMany({ created_by: userId })

    await Community.deleteMany({ founder: userId })
    await Community.updateMany(
      { followers: userId },
      { $pull: { followers: userId, creators: userId } }
    )

    await User.updateMany(
      { $or: [{ followers: userId }, { following: userId }] },
      { $pull: { followers: userId, following: userId } }
    )

    await User.findByIdAndDelete(userId)

    res.status(200).json({ message: 'User profile deleted successfully' })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const DeleteCommunity = async (req, res, next) => {
  const { communityId } = req.params
  const userId = req.user.id

  try {
    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    if (!community.founder.equals(userId)) {
      return res
        .status(403)
        .json({ message: 'Only the founder can delete the community' })
    }

    await User.updateMany(
      {
        $or: [
          { community: communityId },
          { my_communities: communityId },
          { saved_items: communityId },
        ],
      },
      {
        $pull: {
          community: communityId,
          my_communities: communityId,
          saved_items: communityId,
        },
      }
    )

    await Community.findByIdAndDelete(communityId)

    res.status(200).json({ message: 'Community deleted successfully' })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const DeleteSeries = async (req, res, next) => {
  const { seriesId } = req.params
  const userId = req.user.id

  try {
    const series = await Series.findById(seriesId)
    if (!series) {
      return res.status(404).json({ message: 'Series not found' })
    }

    if (!series.created_by.equals(userId)) {
      return res
        .status(403)
        .json({ message: 'You can only delete series you created' })
    }

    await LongVideo.updateMany(
      { series: seriesId },
      {
        $unset: { series: 1, episode_number: 1 },
        $set: { is_standalone: true, season_number: 1 },
      }
    )

    await Community.updateMany(
      { series: seriesId },
      { $pull: { series: seriesId } }
    )

    await User.updateMany(
      { saved_series: seriesId },
      { $pull: { saved_series: seriesId } }
    )

    await Series.findByIdAndDelete(seriesId)

    res.status(200).json({
      message:
        'Series deleted successfully. All episodes converted to standalone videos.',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const RemoveVideoFromCommunity = async (req, res, next) => {
  const { communityId, videoId } = req.body
  const { videoType } = req.query
  const userId = req.user.id

  if (!communityId || !videoId || !videoType) {
    return res
      .status(400)
      .json({ message: 'Community ID, video ID, and video type are required' })
  }

  if (!['long', 'short'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'short'" })
  }

  try {
    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    if (
      !community.founder.equals(userId) &&
      !community.creators.includes(userId)
    ) {
      return res.status(403).json({
        message: 'Only founder or creators can remove videos from community',
      })
    }

    const videoField = videoType === 'long' ? 'long_videos' : 'short_videos'

    if (!community[videoField].includes(videoId)) {
      return res
        .status(404)
        .json({ message: 'Video not found in this community' })
    }

    await Community.findByIdAndUpdate(communityId, {
      $pull: { [videoField]: videoId },
    })

    res.status(200).json({
      message: `${videoType} video removed from community successfully`,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const UnfollowCommunity = async (req, res, next) => {
  const { communityId } = req.body
  const userId = req.user.id

  if (!communityId) {
    return res.status(400).json({ message: 'Community ID is required' })
  }

  try {
    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    if (!community.followers.includes(userId)) {
      return res
        .status(400)
        .json({ message: 'You are not following this community' })
    }

    await Community.findByIdAndUpdate(communityId, {
      $pull: { followers: userId },
    })

    await User.findByIdAndUpdate(userId, { $pull: { community: communityId } })

    res.status(200).json({ message: 'Successfully unfollowed the community' })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const RemoveUserFromCommunity = async (req, res, next) => {
  const { communityId, targetUserId } = req.body
  const userId = req.user.id

  if (!communityId || !targetUserId) {
    return res
      .status(400)
      .json({ message: 'Community ID and target user ID are required' })
  }

  try {
    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    if (!community.founder.equals(userId)) {
      return res
        .status(403)
        .json({ message: 'Only the founder can remove users from community' })
    }

    if (community.founder.equals(targetUserId)) {
      return res
        .status(400)
        .json({ message: 'Cannot remove the founder from the community' })
    }

    await Community.findByIdAndUpdate(communityId, {
      $pull: {
        followers: targetUserId,
        creators: targetUserId,
      },
    })

    await User.findByIdAndUpdate(targetUserId, {
      $pull: {
        community: communityId,
        my_communities: communityId,
      },
    })

    res
      .status(200)
      .json({ message: 'User removed from community successfully' })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const BulkDeleteVideos = async (req, res, next) => {
  const { videoIds, videoType } = req.body
  const userId = req.user.id

  if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
    return res.status(400).json({ message: 'Array of video IDs is required' })
  }

  if (!videoType || !['long', 'short'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'short'" })
  }

  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo
    const videos = await VideoModel.find({
      _id: { $in: videoIds },
      created_by: userId,
    })

    if (videos.length === 0) {
      return res
        .status(404)
        .json({ message: 'No videos found that you can delete' })
    }

    const validVideoIds = videos.map((video) => video._id)

    if (videoType === 'long') {
      await Community.updateMany(
        { long_videos: { $in: validVideoIds } },
        { $pull: { long_videos: { $in: validVideoIds } } }
      )

      await User.updateMany(
        {
          $or: [
            { saved_videos: { $in: validVideoIds } },
            { playlist: { $in: validVideoIds } },
            { history: { $in: validVideoIds } },
            { liked_videos: { $in: validVideoIds } },
            { video_frame: { $in: validVideoIds } },
          ],
        },
        {
          $pull: {
            saved_videos: { $in: validVideoIds },
            playlist: { $in: validVideoIds },
            history: { $in: validVideoIds },
            liked_videos: { $in: validVideoIds },
            video_frame: { $in: validVideoIds },
          },
        }
      )
    } else {
      await Community.updateMany(
        { short_videos: { $in: validVideoIds } },
        { $pull: { short_videos: { $in: validVideoIds } } }
      )
    }

    await VideoModel.deleteMany({ _id: { $in: validVideoIds } })

    res.status(200).json({
      message: `${validVideoIds.length} ${videoType} video(s) deleted successfully`,
      deletedCount: validVideoIds.length,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  DeleteLongVideo,
  DeleteShortVideo,
  DeleteUserProfile,
  DeleteCommunity,
  DeleteSeries,
  RemoveVideoFromCommunity,
  UnfollowCommunity,
  RemoveUserFromCommunity,
  BulkDeleteVideos,
}
