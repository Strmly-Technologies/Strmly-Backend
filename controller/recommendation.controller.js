const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const Reshare = require('../models/Reshare')
const { handleError } = require('../utils/utils')

const getPersonalizedVideoRecommendations = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { page = 1, batchSize = 5 } = req.query

    const user = await User.findById(userId).select('interests viewed_videos')
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const userInterests = user.interests || []
    const viewedVideoIds = user.viewed_videos || []

    let recommendedVideos = []
    
    if (userInterests.length > 0) {
    
      const interestedVideos = await LongVideo.find({
        genre: { $in: userInterests },
        _id: { $nin: viewedVideoIds },
      })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ views: -1, likes: -1 })
        .limit(Math.ceil(batchSize * 0.7))

      recommendedVideos.push(...interestedVideos)
    }

    // Get random videos from other genres (30% of recommendations)
    const otherGenres = [
      'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 
      'Romance', 'Documentary', 'Thriller', 'Fantasy', 'Animation'
    ].filter(genre => !userInterests.includes(genre))

    if (otherGenres.length > 0) {
      const randomVideos = await LongVideo.find({
        genre: { $in: otherGenres },
        _id: { $nin: viewedVideoIds },
      })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ views: -1, likes: -1 })
        .limit(Math.floor(batchSize * 0.3) + 1)

      recommendedVideos.push(...randomVideos)
    }

    // Get reshared videos 
    const resharedVideoSkip = (page - 1) * 2
    const resharedVideos = await Reshare.find({})
      .sort({ createdAt: -1 })
      .skip(resharedVideoSkip)
      .limit(2)
      .populate('user', 'username profile_photo')
      .populate({
        path: 'long_video',
        populate: [
          { path: 'created_by', select: 'username profile_photo' },
          { path: 'community', select: 'name profile_photo' },
        ],
      })

    // Shuffle the combined array for better variety
    recommendedVideos = shuffleArray(recommendedVideos)
    
    // we limit to requested batch size
    recommendedVideos = recommendedVideos.slice(0, batchSize)

    // Mark videos as viewed - ONLY the ones that are actually sent to user
    if (recommendedVideos.length > 0) {
      const videoIds = recommendedVideos.map(video => video._id)
      await User.findByIdAndUpdate(userId, {
        $addToSet: { viewed_videos: { $each: videoIds } }
      })
    }

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

const addUserInterest = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { genre } = req.body

    const validGenres = [
      'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi',
      'Romance', 'Documentary', 'Thriller', 'Fantasy', 'Animation'
    ]

    if (!genre || !validGenres.includes(genre)) {
      return res.status(400).json({
        message: 'Invalid genre. Must be one of: ' + validGenres.join(', ')
      })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.interests.includes(genre)) {
      return res.status(400).json({
        message: 'Genre already in user interests'
      })
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { interests: genre }
    })

    res.status(200).json({
      message: 'Interest added successfully',
      addedGenre: genre,
      allInterests: [...user.interests, genre]
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
      remainingInterests: updatedUser.interests
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
    if (!video) {
      return res.status(404).json({ message: 'Video not found' })
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { viewed_videos: videoId }
    })

    res.status(200).json({
      message: 'Video marked as viewed successfully',
      videoId
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
        'recommendation_settings.last_recommendation_reset': new Date()
      }
    })

    res.status(200).json({
      message: 'Viewed videos history reset successfully'
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
          _id: { $in: user.viewed_videos }
        })
        
        return {
          genre,
          totalVideos,
          viewedVideos: viewedInGenre,
          remainingVideos: totalVideos - viewedInGenre
        }
      })
    )

    res.status(200).json({
      message: 'Recommendation stats retrieved successfully',
      userInterests: user.interests,
      totalViewedVideos: user.viewed_videos.length,
      interestStats,
      lastRecommendationReset: user.recommendation_settings?.last_recommendation_reset,
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
