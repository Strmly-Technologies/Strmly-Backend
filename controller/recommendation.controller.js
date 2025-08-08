const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const Reshare = require('../models/Reshare')
const { handleError } = require('../utils/utils')
const { checkCreatorPassAccess } = require('./creatorpass.controller')
const UserAccess = require('../models/UserAccess')

const getPersonalizedVideoRecommendations = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const page = parseInt(req.query.page) || 1
    const batchSize = parseInt(req.query.batchSize) || 5

    const user = await User.findById(userId).select(
      'interests viewed_videos following'
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const userInterests = user.interests || []
    const viewedVideoIds = user.viewed_videos || []
    const followingIds = (user.following || []).map((id) => id.toString())

    let recommendedVideos = []

    if (userInterests.length > 0) {
      const interestedVideos = await LongVideo.find({
        genre: { $in: userInterests },
        _id: { $nin: viewedVideoIds },
        visibility: { $ne: 'hidden' },
      })
        .lean()
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo followers')
        .populate({
          path: 'series',
          populate: {
            path: 'episodes',
            select:
              'name episode_number season_number thumbnailUrl views likes',
            options: { sort: { season_number: 1, episode_number: 1 } },
          },
        })
        .sort({ views: -1, likes: -1 })
        .limit(Math.ceil(batchSize * 0.7))

      // Process each video with access check
      for (let i = 0; i < interestedVideos.length; i++) {
        let video = interestedVideos[i].toObject() // Convert to plain object

        // Add following status
        if (
          video.created_by &&
          followingIds.includes(video.created_by._id.toString())
        ) {
          video.is_following_creator = true
        } else {
          video.is_following_creator = false
        }

        if (video.community) {
          const isFollowing = video.community.followers.some(
            (followerId) => followerId.toString() === userId
          )
          video.is_following_community = isFollowing
        }
        /*         if (video.start_time && video.display_till_time) {
          video.start_time = video.start_time
          video.display_till_time = video.display_till_time
        } */

        // Check access and add access field
        video = await checkAccess(video, userId)
        interestedVideos[i] = video
      }

      recommendedVideos.push(...interestedVideos)
    }

    // Get random videos from other genres (30% of recommendations)
    const otherGenres = [
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
    ].filter((genre) => !userInterests.includes(genre))

    if (otherGenres.length > 0) {
      const randomVideos = await LongVideo.find({
        genre: { $in: otherGenres },
        _id: { $nin: viewedVideoIds },
        visibility: { $ne: 'hidden' },
      })
        .lean()
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo followers')
        .populate({
          path: 'series',
          populate: {
            path: 'episodes',
            select:
              'name episode_number season_number thumbnailUrl views likes',
            options: { sort: { season_number: 1, episode_number: 1 } },
          },
        })
        .sort({ views: -1, likes: -1 })
        .limit(Math.floor(batchSize * 0.3) + 1)

      // Process each random video with access check
      for (let i = 0; i < randomVideos.length; i++) {
        let video = randomVideos[i].toObject() // Convert to plain object

        // Add following status
        if (
          video.created_by &&
          followingIds.includes(video.created_by._id.toString())
        ) {
          video.is_following_creator = true
        } else {
          video.is_following_creator = false
        }

        if (video.community) {
          const isFollowing = video.community.followers.some(
            (followerId) => followerId.toString() === userId
          )
          video.is_following_community = isFollowing
        }
        /*         if (video.start_time && video.display_till_time) {
          video.start_time = video.start_time
          video.display_till_time = video.display_till_time
        } */

        // Check access and add access field
        video = await checkAccess(video, userId)
        randomVideos[i] = video
      }

      recommendedVideos.push(...randomVideos)
    }

    // Get reshared videos - Only from users that the current user follows
    const resharedVideoSkip = (page - 1) * 2
    const resharedVideos = await Reshare.find({
      user: { $in: followingIds },
      long_video: { $ne: null }, // Filter out null long_video entries
    })
      .lean()
      .sort({ createdAt: -1 })
      .skip(resharedVideoSkip)
      .limit(2)
      .populate('user', 'username profile_photo')
      .populate({
        path: 'long_video',
        select: 'name description thumbnailUrl _id',
        populate: [
          { path: 'created_by', select: 'username profile_photo _id' },
          { path: 'community', select: 'name profile_photo followers _id' },
        ],
      })

    // Process reshared videos with access check
    for (let i = 0; i < resharedVideos.length; i++) {
      const reshare = resharedVideos[i]

      if (reshare.long_video) {
        let video = reshare.long_video.toObject() // Convert to plain object

        // Add following status
        if (
          video.created_by &&
          followingIds.includes(video.created_by._id.toString())
        ) {
          video.is_following_creator = true
        } else {
          video.is_following_creator = false
        }

        if (video.community) {
          const isFollowing = video.community.followers.some(
            (followerId) => followerId.toString() === userId
          )
          video.is_following_community = isFollowing
        }

        // Check access and add access field
        video = await checkAccess(video, userId)
        resharedVideos[i].long_video = video
      }
    }

    // Shuffle the combined array for better variety
    recommendedVideos = shuffleArray(recommendedVideos)

    // Limit to requested batch size
    recommendedVideos = recommendedVideos.slice(0, batchSize)

    res.status(200).json({
      message: 'Personalized recommendations retrieved successfully',
      recommendations: recommendedVideos,
      reshared: resharedVideos,
      userInterests,
      totalRecommendations: recommendedVideos.length,
      pagination: {
        page: parseInt(page),
        batchSize: parseInt(batchSize),
        hasMore: recommendedVideos.length === parseInt(batchSize),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Fixed checkAccess function
const checkAccess = async (video, userId) => {
  try {
    if (video.type === 'Free') {
      video.access = {
        isPlayable: true,
        freeRange: {
          start_time: video.start_time || 0,
          display_till_time: video.display_till_time || 0,
        },
        isPurchased: true,
        accessType: 'free',
      }
    } else if (video.type === 'Paid') {
      // Check if user has creator pass access
      const hasCreatorPass = await checkCreatorPassAccess(
        userId,
        video.created_by._id.toString()
      )

      if (hasCreatorPass.hasAccess) {
        video.access = {
          isPlayable: true,
          freeRange: {
            start_time: video.start_time || 0,
            display_till_time: video.display_till_time || 0,
          },
          isPurchased: true,
          accessType: 'creator_pass',
        }
      } else {
        // Check if user has purchased the video
        const hasPurchasedVideo = await UserAccess.findOne({
          user_id: userId,
          content_id: video._id,
          content_type: 'video',
          access_type: 'paid',
        })

        if (hasPurchasedVideo) {
          video.access = {
            isPlayable: true,
            freeRange: {
              start_time: video.start_time || 0,
              display_till_time: video.display_till_time || 0,
            },
            isPurchased: true,
            accessType: 'purchased',
          }
        } else {
          video.access = {
            isPlayable: false,
            freeRange: {
              start_time: video.start_time || 0,
              display_till_time: video.display_till_time || 0,
            },
            isPurchased: false,
            accessType: 'limited',
            price: video.amount || 0,
          }
        }
      }
    } else {
      // Default access for unknown type
      video.access = {
        isPlayable: false,
        freeRange: {
          start_time: video.start_time || 0,
          display_till_time: video.display_till_time || 0,
        },
        isPurchased: false,
        accessType: 'unknown',
      }
    }

    return video
  } catch (error) {
    console.error('Error checking video access:', error)
    // Return video with limited access if error occurs
    video.access = {
      isPlayable: false,
      freeRange: {
        start_time: video.start_time || 0,
        display_till_time: video.display_till_time || 0,
      },
      isPurchased: false,
      accessType: 'error',
    }
    return video
  }
}

const addUserInterest = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { genre } = req.body

    const validGenres = [
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
    ]

    if (!genre || !validGenres.includes(genre)) {
      return res.status(400).json({
        message: 'Invalid genre. Must be one of: ' + validGenres.join(', '),
      })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.interests.includes(genre)) {
      return res.status(400).json({
        message: 'Genre already in user interests',
      })
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { interests: genre },
    })

    res.status(200).json({
      message: 'Interest added successfully',
      addedGenre: genre,
      allInterests: [...user.interests, genre],
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const removeUserInterest = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { genre } = req.body

    if (!genre) {
      return res.status(400).json({ message: 'Genre is required' })
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { interests: genre } },
      { new: true }
    ).select('interests')

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.status(200).json({
      message: 'Interest removed successfully',
      removedGenre: genre,
      remainingInterests: updatedUser.interests,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const markVideoAsViewed = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { videoId } = req.body

    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' })
    }

    // Check if video exists
    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { viewed_videos: videoId },
    })

    res.status(200).json({
      message: 'Video marked as viewed successfully',
      videoId,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const resetViewedVideos = async (req, res, next) => {
  try {
    const userId = req.user.id

    await User.findByIdAndUpdate(userId, {
      $set: {
        viewed_videos: [],
        'recommendation_settings.last_recommendation_reset': new Date(),
      },
    })

    res.status(200).json({
      message: 'Viewed videos history reset successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserRecommendationStats = async (req, res, next) => {
  try {
    const userId = req.user.id

    const user = await User.findById(userId).select(
      'interests viewed_videos recommendation_settings'
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const interestStats = await Promise.all(
      user.interests.map(async (genre) => {
        const totalVideos = await LongVideo.countDocuments({ genre })
        const viewedInGenre = await LongVideo.countDocuments({
          genre,
          _id: { $in: user.viewed_videos },
        })

        return {
          genre,
          totalVideos,
          viewedVideos: viewedInGenre,
          remainingVideos: totalVideos - viewedInGenre,
        }
      })
    )

    res.status(200).json({
      message: 'Recommendation stats retrieved successfully',
      userInterests: user.interests,
      totalViewedVideos: user.viewed_videos.length,
      interestStats,
      lastRecommendationReset:
        user.recommendation_settings?.last_recommendation_reset,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Utility function to shuffle array
const shuffleArray = (array) => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

module.exports = {
  getPersonalizedVideoRecommendations,
  addUserInterest,
  removeUserInterest,
  markVideoAsViewed,
  resetViewedVideos,
  getUserRecommendationStats,
}
