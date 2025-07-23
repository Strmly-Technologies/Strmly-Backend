const User = require('../models/User')
const Community = require('../models/Community')
const {
  uploadVideoToS3,
  handleError,
  generateVideoThumbnail,
  uploadImageToS3,
  getFileFromS3Url,
} = require('../utils/utils')
const { checkCommunityUploadPermission } = require('./community.controller')
const LongVideo = require('../models/LongVideo')
const Series = require('../models/Series')
const videoCompressor = require('../utils/video_compressor')
const generateVideoABSSegments = require('../utils/ABS')

const uploadVideoToCommunity = async (req, res, next) => {
  try {
    const { communityId, videoId } = req.body
    const userId = req.user.id

    const hasPermission = await checkCommunityUploadPermission(
      userId,
      communityId
    )
    if (!hasPermission.hasPermission) {
      return res.status(403).json({
        error: hasPermission.error,
        requiredFee: hasPermission.requiredFee,
        communityName: hasPermission.communityName,
      })
    }
    const updatedCommunity = await Community.findByIdAndUpdate(
      communityId,
      {
        $addToSet: {
          [`long_videos`]: videoId,
        },
      },
      { new: true }
    )
    if (!updatedCommunity) {
      return res.status(404).json({ error: 'Community not found' })
    }

    res.status(200).json({
      message: 'Video added to community successfully',
      community: {
        id: updatedCommunity._id,
        name: updatedCommunity.name,
        long_videos: updatedCommunity.long_videos,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const uploadVideo = async (req, res, next) => {
  try {
    const videoFile = req.files?.videoFile?.[0]
    const userId = req.user.id.toString()
    const {
      name,
      description,
      genre,
      type,
      language,
      age_restriction,
      communityId,
      seriesId,
      start_time,
      display_till_time,
      is_standalone,
    } = req.body

    if (!userId) {
      console.error(' User ID not found in request')
      return res.status(400).json({ error: 'User ID is required' })
    }

    if (!videoFile) {
      console.error(' No video file found in request')
      return res.status(400).json({ error: 'No video file uploaded' })
    }
    if (!is_standalone) {
      console.error('is_standalone field not found')
      return res.status(400).json({ error: 'is_standalone field required' })
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
    const {
      compressedVideoBuffer,
      outputPath,
      fileOriginalName,
      fileMimeType,
    } = await videoCompressor(videoFile)

    const videoUploadResult = await uploadVideoToS3(
      compressedVideoBuffer,
      fileOriginalName,
      fileMimeType
    )
    if (!videoUploadResult.success) {
      console.error(' S3 upload failed:', videoUploadResult)
      return res.status(500).json({
        error: videoUploadResult.message,
        details: videoUploadResult.error || 'Failed to upload video to S3',
      })
    }

    const thumbnailBuffer = await generateVideoThumbnail(outputPath)

    const thumbnailUploadResult = await uploadImageToS3(
      `${fileOriginalName}_thumbnail`,
      'image/png',
      thumbnailBuffer,
      'video_thumbnails'
    )
    if (!thumbnailUploadResult.success) {
      console.log(thumbnailUploadResult.error)
      return res.status(500).json({ message: 'Failed to upload thumbnail' })
    }
    const longVideo = {
      name: name || videoFile.originalname,
      description: description || 'No description provided',
      videoUrl: videoUploadResult.url,
      created_by: userId,
      updated_by: userId,
      community: communityId,
      thumbnailUrl: thumbnailUploadResult.url,
      genre: genre || 'Action',
      type: type || 'Free',
      series: seriesId || null,
      age_restriction:
        age_restriction === 'true' || age_restriction === true || false,
      Videolanguage: language || 'English',
      start_time: start_time ? Number(start_time) : 0,
      display_till_time: display_till_time ? Number(display_till_time) : 0,
      subtitles: [],
      is_standalone: is_standalone === 'true',
    }
    let savedVideo = new LongVideo(longVideo)

    await savedVideo.save()

    await Community.findByIdAndUpdate(communityId, {
      $push: { long_videos: savedVideo._id },
    })

    res.status(200).json({
      message: 'Video uploaded successfully',

      videoUrl: videoUploadResult.url,
      videoS3Key: videoUploadResult.key,
      thumbnailUrl: thumbnailUploadResult.url,
      thumbnailS3Key: thumbnailUploadResult.key,
      videoName: videoFile.originalname,
      fileSize: videoFile.size,

      videoId: savedVideo._id,

      videoData: {
        name: savedVideo.name,
        description: savedVideo.description,
        genre: savedVideo.genre,
        type: savedVideo.type,
        language: savedVideo.language,
        age_restriction: savedVideo.age_restriction,
        start_time: savedVideo.start_time,
        display_till_time: savedVideo.display_till_time,
      },
      nextSteps: {
        message: 'Use videoId to add this video to a community',
        endpoint: '/api/v1/videos/upload/community',
        requiredFields: ['communityId', 'videoId'],
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const createVideoABSSegments = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { videoId } = req.body

    if (!userId || !videoId) {
      console.error(' User ID or Video ID not found in request')
      return res.status(400).json({ error: 'User ID, Video ID is required' })
    }

    const video = await LongVideo.findById(videoId)

    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }
    const videoUrl = video.videoUrl
    const videoFile = await getFileFromS3Url(videoUrl)

    const videoSegmentUrls = await generateVideoABSSegments(videoFile, videoId)
    video.videoResolutions = videoSegmentUrls
    await video.save()
    res.status(200).json({
      message: 'Segments created successfully',
      segments: videoSegmentUrls,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getVideoABSSegments = async (req, res, next) => {
  const userId = req.user.id.toString()
  const { videoId } = req.query

  if (!userId || !videoId) {
    console.error(' User ID or Video ID not found in request')
    return res.status(400).json({ error: 'User ID, Video ID is required' })
  }

  const video = await LongVideo.findById(videoId).select('videoResolutions')
  if (!video) {
    return res.status(404).json({ error: 'Video not found' })
  }
  res.status(200).json({
    message: 'Segments retrieved successfully',
    segments: video.videoResolutions,
  })
  try {
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

    const longVideos = await LongVideo.find({
      $and: [
        {
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { genre: searchRegex },
          ],
        },
        { visibility: { $ne: 'hidden' } }
      ]
    })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })

    const totalLong = await LongVideo.countDocuments({
      $and: [
        {
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { genre: searchRegex },
          ],
        },
        { visibility: { $ne: 'hidden' } }
      ]
    })

    res.status(200).json({
      message: 'Search results retrieved successfully',
      data: {
        longVideos,

        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalLong / limit),
          totalResults: totalLong,
          longVideoCount: totalLong,
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
    let video = await LongVideo.findById(id)
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('series', 'title')

    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    res.status(200).json({
      message: 'Video retrieved successfully',
      data: {
        ...video.toObject(),
        start_time: video.start_time,
        display_till_time: video.display_till_time,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const updateVideo = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const { name, description, genre, language, age_restriction, start_time, display_till_time } = req.body

    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      updated_by: userId,
    }

    if (genre) updateData.genre = genre
    if (language) updateData.language = language
    if (age_restriction !== undefined)
      updateData.age_restriction = age_restriction
    if (start_time !== undefined) updateData.start_time = Number(start_time)
    if (display_till_time !== undefined) updateData.display_till_time = Number(display_till_time)

    let video = await LongVideo.findById(id)
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
    const userId = req.user.id

    let video = await LongVideo.findById(id)
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

    res.status(200).json({
      message: 'Video deleted successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTrendingVideos = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    let videos = await LongVideo.find({
      visibility: { $ne: 'hidden' },
    })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('series', 'title')
      .sort({ views: -1, likes: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    let total = await LongVideo.countDocuments()

    res.status(200).json({
      message: 'Trending videos retrieved successfully',
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

const getVideosByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    const videos = await LongVideo.find({ 
      genre, 
      visibility: { $ne: 'hidden' } 
    })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('series', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await LongVideo.countDocuments({ 
      genre, 
      visibility: { $ne: 'hidden' } 
    })

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

    let video = await LongVideo.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    )

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

    let video = await LongVideo.findById(id)

    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const relatedVideos = await LongVideo.find({
      _id: { $ne: id },
      genre: video.genre,
      visibility: { $ne: 'hidden' }
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
  uploadVideoToCommunity,
  createVideoABSSegments,
  getVideoABSSegments,
}
