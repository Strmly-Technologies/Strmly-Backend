const ShortVideo = require('../models/ShortVideos')
const User = require('../models/User')
const Community = require('../models/Community')
const { uploadVideoToS3, handleError } = require('../utils/utils')
const { checkCommunityUploadPermission } = require('./community.controller')
const LongVideo = require('../models/LongVideo')
const Series = require('../models/Series')

const uploadVideo = async (req, res, next) => {
  try {
    const videoType = req.videoType
    const videoFile = req.file
    const userId = req.user.id
    const {
      name,
      description,
      genre,
      type,
      language,
      age_restriction,
      communityId,
    } = req.body

    if (!userId) {
      console.error(' User ID not found in request')
      return res.status(400).json({ error: 'User ID is required' })
    }

    if (!videoFile) {
      console.error(' No video file found in request')
      return res.status(400).json({ error: 'No video file uploaded' })
    }

    if (!videoType) {
      console.error(' No video type found in request')
      return res.status(400).json({
        error: 'Video type is required. Use ?type=short or ?type=long',
      })
    }

    // Check upload permission using the proper function
    if (communityId) {
      const permissionCheck = await checkCommunityUploadPermission(
        userId,
        communityId
      )

      if (!permissionCheck.hasPermission) {
        return res.status(403).json({
          error: permissionCheck.error,
          requiredFee: permissionCheck.requiredFee,
          communityName: permissionCheck.communityName,
        })
      }

      // Check if user follows the community (only for non-founders)
      if (permissionCheck.accessType !== 'founder') {
        const community = await Community.findById(communityId)
        if (!community.followers.includes(userId)) {
          return res.status(403).json({
            error: 'You must follow the community to upload videos',
          })
        }
      }
    }

    const user = await User.findById(userId).select('-password')
    if (!user) {
      console.error(' User not found:', userId)
      return res.status(404).json({ error: 'User not found' })
    }

    const uploadResult = await uploadVideoToS3(videoFile, videoType)
    if (!uploadResult.success) {
      console.error(' S3 upload failed:', uploadResult)
      return res.status(500).json({
        error: uploadResult.message,
        details: uploadResult.error || 'Failed to upload video to S3',
      })
    }

    let savedVideo
    if (videoType === 'short') {
      const shortVideo = {
        name: name || videoFile.originalname,
        description: description || 'No description provided',
        videoUrl: uploadResult.url,
        created_by: userId,
        updated_by: userId,
        community: communityId,
      }
      savedVideo = new ShortVideo(shortVideo)
    } else if (videoType === 'long') {
      const longVideo = {
        name: name || videoFile.originalname,
        description: description || 'No description provided',
        videoUrl: uploadResult.url,
        created_by: userId,
        updated_by: userId,
        community: communityId,
        thumbnailUrl: '',
        genre: genre || 'Action',
        type: type || 'Free',
        age_restriction:
          age_restriction === 'true' || age_restriction === true || false,
        language: language || 'English',
        subtitles: [],
      }
      savedVideo = new LongVideo(longVideo)
    }

    await savedVideo.save()

    if (videoType === 'short') {
      await Community.findByIdAndUpdate(communityId, {
        $push: { short_videos: savedVideo._id },
      })
    } else if (videoType === 'long') {
      await Community.findByIdAndUpdate(communityId, {
        $push: { long_videos: savedVideo._id },
      })
    }

    res.status(200).json({
      message: 'Video uploaded successfully',
      videoType: videoType,

      videoUrl: uploadResult.url,
      s3Key: uploadResult.key,

      videoName: videoFile.originalname,
      fileSize: videoFile.size,

      videoId: savedVideo._id,

      videoData: {
        name: savedVideo.name,
        description: savedVideo.description,
        ...(videoType === 'long' && {
          genre: savedVideo.genre,
          type: savedVideo.type,
          language: savedVideo.language,
          age_restriction: savedVideo.age_restriction,
        }),
      },
      nextSteps: {
        message: 'Use videoId to add this video to a community',
        endpoint: `/api/v1/community/add-${videoType}-video`,
        requiredFields: ['communityId', 'videoId'],
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const searchVideos = async (req, res, next) => {
  try {
    const { query, page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' })
    }

    const searchRegex = new RegExp(query, 'i')

    const [longVideos, shortVideos] = await Promise.all([
      LongVideo.find({
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { genre: searchRegex },
        ],
      })
        .populate('created_by', 'username email')
        .populate('community', 'name')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),

      ShortVideo.find({
        $or: [{ name: searchRegex }, { description: searchRegex }],
      })
        .populate('created_by', 'username email')
        .populate('community', 'name')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 }),
    ])

    const totalLong = await LongVideo.countDocuments({
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { genre: searchRegex },
      ],
    })

    const totalShort = await ShortVideo.countDocuments({
      $or: [{ name: searchRegex }, { description: searchRegex }],
    })

    res.status(200).json({
      message: 'Search results retrieved successfully',
      data: {
        longVideos,
        shortVideos,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil((totalLong + totalShort) / limit),
          totalResults: totalLong + totalShort,
          longVideoCount: totalLong,
          shortVideoCount: totalShort,
        },
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getVideoById = async (req, res, next) => {
  try {
    const { id } = req.params
    const { type } = req.query

    let video
    if (type === 'short') {
      video = await ShortVideo.findById(id)
        .populate('created_by', 'username email')
        .populate('community', 'name')
    } else {
      video = await LongVideo.findById(id)
        .populate('created_by', 'username email')
        .populate('community', 'name')
        .populate('series', 'title')
    }

    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    res.status(200).json({
      message: 'Video retrieved successfully',
      data: video,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const updateVideo = async (req, res, next) => {
  try {
    const { id } = req.params
    const { type } = req.query
    const userId = req.user.id
    const { name, description, genre, language, age_restriction } = req.body

    let video
    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      updated_by: userId,
    }

    if (type === 'short') {
      video = await ShortVideo.findById(id)
      if (!video) {
        return res.status(404).json({ error: 'Short video not found' })
      }

      if (video.created_by.toString() !== userId) {
        return res
          .status(403)
          .json({ error: 'Not authorized to update this video' })
      }

      video = await ShortVideo.findByIdAndUpdate(id, updateData, {
        new: true,
      })
    } else {
      if (genre) updateData.genre = genre
      if (language) updateData.language = language
      if (age_restriction !== undefined)
        updateData.age_restriction = age_restriction

      video = await LongVideo.findById(id)
      if (!video) {
        return res.status(404).json({ error: 'Long video not found' })
      }

      if (video.created_by.toString() !== userId) {
        return res
          .status(403)
          .json({ error: 'Not authorized to update this video' })
      }

      video = await LongVideo.findByIdAndUpdate(id, updateData, {
        new: true,
      })
    }

    res.status(200).json({
      message: 'Video updated successfully',
      data: video,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const deleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params
    const { type } = req.query
    const userId = req.user.id

    let video
    if (type === 'short') {
      video = await ShortVideo.findById(id)
      if (!video) {
        return res.status(404).json({ error: 'Short video not found' })
      }

      if (video.created_by.toString() !== userId) {
        return res
          .status(403)
          .json({ error: 'Not authorized to delete this video' })
      }

      await ShortVideo.findByIdAndDelete(id)
    } else {
      video = await LongVideo.findById(id)
      if (!video) {
        return res.status(404).json({ error: 'Long video not found' })
      }

      if (video.created_by.toString() !== userId) {
        return res
          .status(403)
          .json({ error: 'Not authorized to delete this video' })
      }

      if (video.series) {
        await Series.findByIdAndUpdate(video.series, {
          $pull: { episodes: id },
          $inc: { total_episodes: -1 },
        })
      }

      await LongVideo.findByIdAndDelete(id)
    }

    res.status(200).json({
      message: 'Video deleted successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTrendingVideos = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, type } = req.query
    const skip = (page - 1) * limit

    let videos
    let total

    if (type === 'short') {
      videos = await ShortVideo.find()
        .populate('created_by', 'username email')
        .populate('community', 'name')
        .sort({ views: -1, likes: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))

      total = await ShortVideo.countDocuments()
    } else if (type === 'long') {
      videos = await LongVideo.find()
        .populate('created_by', 'username email')
        .populate('community', 'name')
        .populate('series', 'title')
        .sort({ views: -1, likes: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))

      total = await LongVideo.countDocuments()
    } else {
      const [longVideos, shortVideos] = await Promise.all([
        LongVideo.find()
          .populate('created_by', 'username email')
          .populate('community', 'name')
          .populate('series', 'title')
          .sort({ views: -1, likes: -1, createdAt: -1 })
          .limit(Math.ceil(limit / 2)),

        ShortVideo.find()
          .populate('created_by', 'username email')
          .populate('community', 'name')
          .sort({ views: -1, likes: -1, createdAt: -1 })
          .limit(Math.floor(limit / 2)),
      ])

      videos = { longVideos, shortVideos }
      total = await Promise.all([
        LongVideo.countDocuments(),
        ShortVideo.countDocuments(),
      ])
    }

    res.status(200).json({
      message: 'Trending videos retrieved successfully',
      data: videos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: type
          ? Math.ceil(total / limit)
          : Math.ceil((total[0] + total[1]) / limit),
        totalResults: type ? total : total[0] + total[1],
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getVideosByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    const videos = await LongVideo.find({ genre })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('series', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await LongVideo.countDocuments({ genre })

    res.status(200).json({
      message: `Videos in ${genre} genre retrieved successfully`,
      data: videos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalResults: total,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const incrementVideoView = async (req, res, next) => {
  try {
    const { id } = req.params
    const { type } = req.query

    let video
    if (type === 'short') {
      video = await ShortVideo.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
      )
    } else {
      video = await LongVideo.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
      )
    }

    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    res.status(200).json({
      message: 'View count updated successfully',
      data: { views: video.views },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getRelatedVideos = async (req, res, next) => {
  try {
    const { id } = req.params
    const { type } = req.query

    let video
    if (type === 'short') {
      video = await ShortVideo.findById(id)
    } else {
      video = await LongVideo.findById(id)
    }

    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const relatedVideos = await (type === 'short' ? ShortVideo : LongVideo)
      .find({
        _id: { $ne: id },
        genre: video.genre,
      })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .limit(10)

    res.status(200).json({
      message: 'Related videos retrieved successfully',
      data: relatedVideos,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  uploadVideo,
  searchVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  getTrendingVideos,
  getVideosByGenre,
  incrementVideoView,
  getRelatedVideos,
}
