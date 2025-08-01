const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const Community = require('../models/Community')
const Series = require('../models/Series')
const { handleError } = require('../utils/utils')
const { handleFounderLeaving } = require('./community.controller')

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

const DeleteUserProfile = async (req, res, next) => {
  const userId = req.user.id

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Handle communities where user is founder
    const foundedCommunities = await Community.find({ founder: userId })
    const communityUpdates = []
    
    for (const community of foundedCommunities) {
      try {
        const nextFounderId = await handleFounderLeaving(community._id, userId)
        if (nextFounderId) {
          communityUpdates.push({
            communityId: community._id,
            communityName: community.name,
            newFounderId: nextFounderId
          })
        } else {
          // No successor found, delete the community
          await Community.findByIdAndDelete(community._id)
        }
      } catch (error) {
        console.error(`Error handling founder succession for community ${community._id}:`, error)
        // If succession fails, delete the community
        await Community.findByIdAndDelete(community._id)
      }
    }

    // Remove user from other communities
    await Community.updateMany(
      { followers: userId },
      { 
        $pull: { 
          followers: userId, 
          creators: userId,
          'creator_join_order': { user: userId }
        } 
      }
    )

    // Delete user's content
    await LongVideo.deleteMany({ created_by: userId })
    await Series.deleteMany({ created_by: userId })

    // Remove user from other users' follow lists
    await User.updateMany(
      { $or: [{ followers: userId }, { following: userId }] },
      { $pull: { followers: userId, following: userId } }
    )

    // Delete the user
    await User.findByIdAndDelete(userId)

    res.status(200).json({ 
      message: 'User profile deleted successfully',
      communityUpdates: communityUpdates.length > 0 ? {
        message: `Founder role transferred in ${communityUpdates.length} communities`,
        updates: communityUpdates
      } : null
    })
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
  const userId = req.user.id

  if (!communityId || !videoId) {
    return res
      .status(400)
      .json({ message: 'Community ID and video ID are required' })
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

    if (!community.long_videos.includes(videoId)) {
      return res
        .status(404)
        .json({ message: 'Video not found in this community' })
    }

    await Community.findByIdAndUpdate(communityId, {
      $pull: { ['long_videos']: videoId },
    })

    res.status(200).json({
      message: `video removed from community successfully`,
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
        .json({ message: 'Cannot remove the founder from the community. Transfer founder role first.' })
    }

    // Remove user from community and join order
    await Community.findByIdAndUpdate(communityId, {
      $pull: {
        followers: targetUserId,
        creators: targetUserId,
        'creator_join_order': { user: targetUserId }
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

// Add new method to handle founder leaving community (without deleting profile)
const removeFounderFromCommunity = async (req, res, next) => {
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

    if (!community.founder.equals(userId)) {
      return res.status(403).json({ 
        message: 'Only the founder can leave their own community' 
      })
    }

    // Handle founder succession
    const nextFounderId = await handleFounderLeaving(communityId, userId)
    
    if (!nextFounderId) {
      // No successor, delete the community
      await Community.findByIdAndDelete(communityId)
      
      // Remove community from all users
      await User.updateMany(
        { community: communityId },
        { $pull: { community: communityId, my_communities: communityId } }
      )
      
      return res.status(200).json({ 
        message: 'You left the community. Since no other creators were available, the community was deleted.' 
      })
    }

    // Remove user from their own community lists
    await User.findByIdAndUpdate(userId, {
      $pull: {
        community: communityId,
        my_communities: communityId,
      },
    })

    const newFounder = await User.findById(nextFounderId).select('username')

    res.status(200).json({ 
      message: 'You left the community successfully. Founder role transferred.',
      newFounder: {
        id: nextFounderId,
        username: newFounder.username
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  DeleteLongVideo,
  DeleteUserProfile,
  DeleteCommunity,
  DeleteSeries,
  RemoveVideoFromCommunity,
  UnfollowCommunity,
  RemoveUserFromCommunity,
  BulkDeleteVideos,
  removeFounderFromCommunity,
}
