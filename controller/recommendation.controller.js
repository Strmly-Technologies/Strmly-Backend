const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const Reshare = require('../models/Reshare')
const { handleError } = require('../utils/utils')


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
