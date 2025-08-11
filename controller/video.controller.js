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
const Reshare = require('../models/Reshare')
const WalletTransaction = require('../models/WalletTransaction')
const addVideoToQueue = require('../utils/video_fingerprint_queue')
const path = require('path')
const os = require('os')
const videoCompressor = require('../utils/video_compressor')
const { generateVideoABSSegments } = require('../utils/ABS')
const fs = require('fs')

const uploadVideoToCommunity = async (req, res, next) => {
  try {
    const { communityId, videoId } = req.body
    const userId = req.user.id
    const video = await LongVideo.findById(videoId).select(
      'visibility hidden_reason community'
    )
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Long video not found' })
    }
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
    if (video.community) {
      if (video.community.toString() === communityId) {
        return res
          .status(400)
          .json({ error: 'Video already uploaded in the Community' })
      } else {
        return res
          .status(404)
          .json({ error: 'Video is uploaded in another community' })
      }
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
    await LongVideo.findByIdAndUpdate(
      videoId,
      { $set: { community: communityId } },
      { new: true }
    )
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
    const videoFile = req.file
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
      episodeNumber,
      amount,
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

    if (is_standalone === 'false' && (!episodeNumber || !seriesId)) {
      console.error(
        'episodeNumber and seriesId required for non-standalone videos'
      )
      return res.status(400).json({
        error: 'episodeNumber and seriesId required for non-standalone videos',
      })
    }
    if (type === 'Paid' && (!amount || amount <= 0)) {
      console.error(
        'Amount has to be included and should be greater than 0 for paid videos'
      )
      return res.status(400).json({
        error:
          'Amount has to be included and should be greater than 0 for paid videos',
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
    const {
      compressedVideoBuffer,
      outputPath,
      fileOriginalName,
      fileMimeType,
      duration,
      durationFormatted,
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
      episode_number: episodeNumber || null,
      amount: type === 'Paid' ? Number(amount) : 0,
      age_restriction:
        age_restriction === 'true' || age_restriction === true || false,
      Videolanguage: language || 'English',
      start_time: start_time ? Number(start_time) : 0,
      display_till_time: display_till_time ? Number(display_till_time) : 0,
      subtitles: [],
      is_standalone: is_standalone === 'true',
      duration: duration || 0,
      duration_formatted: durationFormatted || '00:00:00', // Add this
    }
    let savedVideo = new LongVideo(longVideo)

    await savedVideo.save()

    await Community.findByIdAndUpdate(communityId, {
      $push: { long_videos: savedVideo._id },
      $addToSet: { creators: userId },
    })

    await addVideoToQueue(savedVideo._id, videoUploadResult.url)
    res.status(200).json({
      message: 'Video uploaded successfully',
      videoUrl: videoUploadResult.url,
      videoS3Key: videoUploadResult.key,
      thumbnailUrl: thumbnailUploadResult.url,
      thumbnailS3Key: thumbnailUploadResult.key,
      videoName: videoFile.originalname,
      fileSize: videoFile.size,
      duration: duration || 0,
      durationFormatted: durationFormatted || '00:00:00',
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
        duration: savedVideo.duration || 0,
        duration_formatted: savedVideo.duration_formatted || '00:00:00',
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

const uploadVideoChunks = (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const videoFile = req.file

    const { fileId, chunkIndex, totalChunks } = req.body
    if (!userId) {
      console.error(' User ID not found in request')
      return res.status(400).json({ error: 'User ID is required' })
    }

    if (!fileId || !chunkIndex || !totalChunks) {
      console.error(
        ' file ID, chunk index or total chunks not found in request'
      )
      return res
        .status(400)
        .json({ error: 'fileId, chunkIndex and totalChunks are required' })
    }
    const tempDir = path.join(os.tmpdir(), 'uploads', fileId)
    fs.mkdirSync(tempDir, { recursive: true })

    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`)
    fs.writeFileSync(chunkPath, videoFile.buffer)
    res.status(200).json({
      message: 'Chunk uploaded successfully',
      fileId,
      chunkIndex,
      totalChunks,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}
const isMP4 = (originalname, mimetype) => {
  const isValidExtension = originalname?.toLowerCase().endsWith('.mp4')
  const isValidMime = mimetype === 'video/mp4'
  return isValidExtension && isValidMime
}

const finaliseChunkUpload = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const {
      fileId,
      totalChunks,
      originalname,
      mimetype,
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

    if (!fileId || !totalChunks || !originalname || !mimetype) {
      console.error(
        ' file ID, total chunks, original name or mime type not found in request'
      )
      return res.status(400).json({
        error: 'fileId, totalChunks, originalname and mimetype are required',
      })
    }
    if (!isMP4(originalname, mimetype)) {
      return res.status(400).json({
        error: 'Only .mp4 videos are allowed.',
      })
    }
    //get the whole video file from chunks
    const tempDir = path.join(os.tmpdir(), 'uploads', fileId)
    const finalPath = path.join(tempDir, `full_${originalname}`)

    // Stitch chunks into one file
    const writeStream = fs.createWriteStream(finalPath)

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}`)
      const data = fs.readFileSync(chunkPath)
      writeStream.write(data)
    }

    await new Promise((resolve) => writeStream.end(resolve)) // Wait for write to finish

    //Read final stitched video as Buffer
    const finalVideoBuffer = fs.readFileSync(finalPath)
    const videoFile = {
      buffer: finalVideoBuffer,
      mimetype,
      originalname,
      size: finalVideoBuffer.length,
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

    //compress video file

    const {
      compressedVideoBuffer,
      outputPath,
      fileOriginalName,
      fileMimeType,
      duration,
      durationFormatted,
    } = await videoCompressor(videoFile)

    //delete the fileId folder inside the uploads folder in tmp
    fs.rmSync(tempDir, { recursive: true, force: true })

    //save video to S3
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
      duration: duration || 0,
      duration_formatted: durationFormatted || '00:00:00',
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
      duration: duration,
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
        duration: savedVideo.duration,
        duration_formatted: savedVideo.duration_formatted,
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

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }
    const videoUrl = video.videoUrl
    const videoFile = await getFileFromS3Url(videoUrl)

    const videoSegmentUrls = await generateVideoABSSegments(videoFile, videoId)
    await LongVideo.findOneAndUpdate(
      { _id: videoId },
      { $set: { videoResolutions: videoSegmentUrls } },
      { new: true }
    )

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
  try {
    if (!userId || !videoId) {
      console.error(' User ID or Video ID not found in request')
      return res.status(400).json({ error: 'User ID, Video ID is required' })
    }

    const video = await LongVideo.findById(videoId).select('videoResolutions')
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }
    res.status(200).json({
      message: 'Segments retrieved successfully',
      segments: video.videoResolutions,
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

    const longVideos = await LongVideo.find({
      $and: [
        {
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { genre: searchRegex },
          ],
        },
      ],
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
      ],
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
      .populate({
        path: 'series',
        populate: {
          path: 'episodes',
          select: 'name episode_number season_number thumbnailUrl views likes',
          options: { sort: { season_number: 1, episode_number: 1 } },
        },
      })

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
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
    const {
      name,
      description,
      genre,
      language,
      age_restriction,
      start_time,
      display_till_time,
    } = req.body

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
    if (display_till_time !== undefined)
      updateData.display_till_time = Number(display_till_time)

    let video = await LongVideo.findById(id)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
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
    const userId = req.user.id.toString()
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    let video = await LongVideo.findById(id)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Long video not found' })
    }
    //only video creator is allowed to delete the video
    if (video.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this video' })
    }
    //unpublish video
    await LongVideo.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          visibility: 'hidden',
          hidden_reason: 'video_deleted',
          hidden_at: new Date(),
        },
      },
      { new: true }
    )

    res.status(200).json({
      message: 'Video deleted successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTrendingVideos = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    const user = await User.findById(userId).select('following')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const followingIds = (user.following || []).map((id) => id.toString())

    let videos = await LongVideo.find({})
      .populate('created_by', 'username email profile_photo custom_name')
      .populate('community', 'name profile_photo followers')
      .populate({
        path: 'series',
        select: 'title description price genre episodes seasons total_episodes',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
      })
      .sort({ views: -1, likes: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
    const userReshares = await Reshare.find({ user: userId }).select(
      'long_video'
    )
    videos = videos.map((video) => {
      video = video.toObject()
      const community = video.community
      if (community && community.followers) {
        const isFollowing = community.followers.some(
          (followerId) => followerId.toString() === userId
        )
        video.community = {
          ...community,
          is_following_community: isFollowing,
        }
      }
      video.is_reshared = userReshares.some(
        (reshare) => reshare.long_video.toString() === video._id.toString()
      )
      if (
        video.created_by &&
        followingIds.includes(video.created_by._id.toString())
      ) {
        video.is_following_creator = true
      } else {
        video.is_following_creator = false
      }
      video.start_time = video.start_time || 0
      video.display_till_time = video.display_till_time || 0
      return video
    })
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
    })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('series', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await LongVideo.countDocuments({
      genre,
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

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
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

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const relatedVideos = await LongVideo.find({
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

const getVideoGiftingInfo = async (req, res, next) => {
  try {
    const { id } = req.params

    let video = await LongVideo.findById(id)
      .select('visibility hidden_reason')
      .lean()

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const giftingInfo = await WalletTransaction.find({
      content_id: id,
      transaction_category: 'video_gift',
    })
      .lean()
      .select(
        'user_id amount currency description balance_before balance_after'
      )
      .populate('user_id', 'username profile_photo')
    res.status(200).json({
      message: 'Gifting Info retrieved successfully',
      data: giftingInfo,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getVideoTotalGifting = async (req, res, next) => {
  try {
    const { id } = req.params

    let video = await LongVideo.findById(id)
      .select('visibility hidden_reason gifts')
      .lean()

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }
    res.status(200).json({
      message: 'Gifting Info retrieved successfully',
      data: video.gifts,
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
  uploadVideoChunks,
  finaliseChunkUpload,
  getVideoGiftingInfo,
  getVideoTotalGifting,
}
