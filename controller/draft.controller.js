const Draft = require('../models/Draft')
const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const Community = require('../models/Community')
const {
  handleError,
  uploadVideoToS3,
  uploadImageToS3,
  generateVideoThumbnail,
} = require('../utils/utils')
const { checkCommunityUploadPermission } = require('./community.controller')
const videoCompressor = require('../utils/video_compressor')

// Create or update a draft (metadata only, no video file)
const createOrUpdateDraft = async (req, res, next) => {
  try {
    const userId = req.user.id
    const {
      draftId,
      name,
      description,
      genre,
      type,
      language,
      age_restriction,
      amount,
      communityId,
      seriesId,
      start_time,
      display_till_time,
      contentType = 'video',
    } = req.body

    let draft

    if (draftId) {
      // Update existing draft
      draft = await Draft.findOne({ _id: draftId, user_id: userId })
      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' })
      }
    } else {
      // Create new draft
      draft = new Draft({
        user_id: userId,
        content_type: contentType,
        status: 'draft',
      })
    }

    // Update draft data
    const draftData = {
      ...draft.draft_data,
      ...(name && { name }),
      ...(description && { description }),
      ...(genre && { genre }),
      ...(type && { type }),
      ...(language && { language }),
      ...(age_restriction !== undefined && { age_restriction }),
      ...(communityId && { community_id: communityId }),
      ...(seriesId && { series_id: seriesId }),
      ...(start_time !== undefined && { start_time: Number(start_time) }),
      ...(display_till_time !== undefined && {
        display_till_time: Number(display_till_time),
      }),
    }
    
    console.log('📝 Draft data being saved:', draftData);

    draft.draft_data = draftData
    await draft.save()

    // Add to user's drafts if new
    if (!draftId) {
      await User.findByIdAndUpdate(userId, {
        $addToSet: { drafts: draft._id },
      })
    }

    res.status(200).json({
      message: draftId
        ? 'Draft updated successfully'
        : 'Draft created successfully',
      draft: {
        id: draft._id,
        content_type: draft.content_type,
        status: draft.status,
        draft_data: draft.draft_data,
        last_modified: draft.last_modified,
        expires_at: draft.expires_at,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Upload video to an existing draft
const uploadVideoToDraft = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { id } = req.params
    const videoFile = req.file

    if (!videoFile) {
      return res.status(400).json({ error: 'Video file is required' })
    }

    const draft = await Draft.findOne({ _id: id, user_id: userId })

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (draft.isExpired()) {
      await draft.deleteOne()
      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: draft._id },
      })
      return res
        .status(410)
        .json({ error: 'Draft has expired and was removed' })
    }

    if (draft.video_data?.has_video) {
      return res.status(400).json({
        error:
          'Draft already has a video. Delete the existing video first or create a new draft.',
      })
    }

    // Update draft status
    draft.status = 'uploading'
    await draft.save()

    try {
      const user = await User.findById(userId).select('-password')
      if (!user) {
        throw new Error('User not found')
      }

      // Compress video
      draft.status = 'processing'
      await draft.save()

      const {
        compressedVideoBuffer,
        outputPath,
        fileOriginalName,
        fileMimeType,
      } = await videoCompressor(videoFile)

      // Upload to S3 with draft prefix
      const videoUploadResult = await uploadVideoToS3(
        compressedVideoBuffer,
        `draft_${fileOriginalName}`,
        fileMimeType
      )

      if (!videoUploadResult.success) {
        draft.status = 'failed'
        draft.error_message = videoUploadResult.message
        await draft.save()

        return res.status(500).json({
          error: videoUploadResult.message,
          details: videoUploadResult.error || 'Failed to upload video to S3',
        })
      }

      // Generate and upload thumbnail
      const thumbnailBuffer = await generateVideoThumbnail(outputPath)
      const thumbnailUploadResult = await uploadImageToS3(
        `draft_${fileOriginalName}_thumbnail`,
        'image/png',
        thumbnailBuffer,
        'draft_thumbnails'
      )

      if (!thumbnailUploadResult.success) {
        draft.status = 'failed'
        draft.error_message = 'Failed to upload thumbnail'
        await draft.save()

        return res.status(500).json({ message: 'Failed to upload thumbnail' })
      }

      // Update draft with video information
      draft.video_data = {
        has_video: true,
        video_url: videoUploadResult.url,
        video_s3_key: videoUploadResult.key,
        thumbnail_url: thumbnailUploadResult.url,
        thumbnail_s3_key: thumbnailUploadResult.key,
        original_filename: videoFile.originalname,
        file_size: videoFile.size,
        video_uploaded_at: new Date(),
      }

      draft.status = 'draft'
      await draft.updateExpiryForVideo() // Set 7-day expiry

      res.status(200).json({
        message: 'Video uploaded to draft successfully',
        draft: {
          id: draft._id,
          status: draft.status,
          expires_at: draft.expires_at,
          days_until_expiry: Math.ceil(
            (draft.expires_at - new Date()) / (1000 * 60 * 60 * 24)
          ),
          video_info: {
            original_filename: draft.video_data.original_filename,
            file_size: draft.video_data.file_size,
            uploaded_at: draft.video_data.video_uploaded_at,
          },
        },
        warning:
          'Draft with video will expire in 7 days. Complete upload to save permanently.',
      })
    } catch (uploadError) {
      draft.status = 'failed'
      draft.error_message = uploadError.message
      await draft.save()
      throw uploadError
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Remove video from draft
const removeVideoFromDraft = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const draft = await Draft.findOne({ _id: id, user_id: userId })

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (!draft.video_data?.has_video) {
      return res
        .status(400)
        .json({ error: 'Draft does not have a video to remove' })
    }

    // Note: In production, you might want to delete the S3 files here
    // For now, we'll just clear the video data and reset expiry to 30 days
    draft.video_data = {
      has_video: false,
      video_url: null,
      video_s3_key: null,
      thumbnail_url: null,
      thumbnail_s3_key: null,
      original_filename: null,
      file_size: null,
      video_uploaded_at: null,
    }

    // Reset expiry to 30 days for metadata-only draft
    draft.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    draft.status = 'draft'
    await draft.save()

    res.status(200).json({
      message: 'Video removed from draft successfully',
      draft: {
        id: draft._id,
        status: draft.status,
        expires_at: draft.expires_at,
        has_video: false,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Get all user drafts
const getUserDrafts = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 10, status, contentType } = req.query
    const skip = (page - 1) * limit

    const query = { user_id: userId }

    if (status) {
      query.status = status
    }

    if (contentType) {
      query.content_type = contentType
    }

    const drafts = await Draft.find(query)
      .populate('draft_data.community_id', 'name profile_photo')
      .populate('draft_data.series_id', 'title')
      .sort({ last_modified: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const totalDrafts = await Draft.countDocuments(query)

    // Filter out expired drafts and remove them
    const validDrafts = []
    const expiredDraftIds = []

    for (const draft of drafts) {
      if (draft.isExpired()) {
        expiredDraftIds.push(draft._id)
      } else {
        validDrafts.push({
          id: draft._id,
          content_type: draft.content_type,
          status: draft.status,
          name: draft.draft_data.name || 'Untitled',
          description: draft.draft_data.description || '',
          genre: draft.draft_data.genre,
          last_modified: draft.last_modified,
          expires_at: draft.expires_at,
          days_until_expiry: Math.ceil(
            (draft.expires_at - new Date()) / (1000 * 60 * 60 * 24)
          ),
          community: draft.draft_data.community_id,
          series: draft.draft_data.series_id,
          error_message: draft.error_message,
          has_video: draft.video_data?.has_video || false,
          video_info: draft.video_data?.has_video
            ? {
                original_filename: draft.video_data.original_filename,
                file_size: draft.video_data.file_size,
                uploaded_at: draft.video_data.video_uploaded_at,
                thumbnail_url: draft.video_data.thumbnail_url,
              }
            : null,
        })
      }
    }

    // Remove expired drafts
    if (expiredDraftIds.length > 0) {
      await Draft.deleteMany({ _id: { $in: expiredDraftIds } })
      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: { $in: expiredDraftIds } },
      })
    }

    res.status(200).json({
      message: 'User drafts retrieved successfully',
      drafts: validDrafts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalDrafts: totalDrafts - expiredDraftIds.length,
        totalPages: Math.ceil((totalDrafts - expiredDraftIds.length) / limit),
        hasMore:
          skip + validDrafts.length < totalDrafts - expiredDraftIds.length,
      },
      stats: {
        totalDrafts: validDrafts.length,
        draftsWithVideo: validDrafts.filter((d) => d.has_video).length,
        draftsWithoutVideo: validDrafts.filter((d) => !d.has_video).length,
        expiredRemoved: expiredDraftIds.length,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Get draft by ID
const getDraftById = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const draft = await Draft.findOne({ _id: id, user_id: userId })
      .populate('draft_data.community_id', 'name profile_photo founder')
      .populate('draft_data.series_id', 'title total_episodes')

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (draft.isExpired()) {
      await draft.deleteOne()
      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: draft._id },
      })
      return res
        .status(410)
        .json({ error: 'Draft has expired and was removed' })
    }

    res.status(200).json({
      message: 'Draft retrieved successfully',
      draft: {
        id: draft._id,
        content_type: draft.content_type,
        status: draft.status,
        draft_data: draft.draft_data,
        video_data: draft.video_data,
        last_modified: draft.last_modified,
        expires_at: draft.expires_at,
        error_message: draft.error_message,
        created_at: draft.createdAt,
        updated_at: draft.updatedAt,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Complete draft upload (convert draft to actual video)
const completeDraftUpload = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { id } = req.params
    const videoFile = req.file

    const draft = await Draft.findOne({ _id: id, user_id: userId })

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (draft.isExpired()) {
      await draft.deleteOne()
      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: draft._id },
      })
      return res
        .status(410)
        .json({ error: 'Draft has expired and was removed' })
    }

    // Check if draft already has video or if new video is provided
    if (!draft.video_data?.has_video && !videoFile) {
      return res
        .status(400)
        .json({ error: 'Video file is required to complete upload' })
    }

    // Update draft status
    draft.status = 'uploading'
    await draft.save()

    try {
      // Check community permissions if applicable
      if (draft.draft_data.community_id) {
        const permissionCheck = await checkCommunityUploadPermission(
          userId,
          draft.draft_data.community_id
        )

        if (!permissionCheck.hasPermission) {
          draft.status = 'failed'
          draft.error_message = permissionCheck.error
          await draft.save()

          return res.status(403).json({
            error: permissionCheck.error,
            requiredFee: permissionCheck.requiredFee,
            communityName: permissionCheck.communityName,
          })
        }
      }

      let videoUploadResult, thumbnailUploadResult

      if (draft.video_data?.has_video) {
        // Use existing video from draft
        videoUploadResult = {
          success: true,
          url: draft.video_data.video_url,
          key: draft.video_data.video_s3_key,
        }
        thumbnailUploadResult = {
          success: true,
          url: draft.video_data.thumbnail_url,
          key: draft.video_data.thumbnail_s3_key,
        }
      } else {
        // Process new video file
        draft.status = 'processing'
        await draft.save()

        const {
          compressedVideoBuffer,
          outputPath,
          fileOriginalName,
          fileMimeType,
        } = await videoCompressor(videoFile)

        // Upload to S3
        videoUploadResult = await uploadVideoToS3(
          compressedVideoBuffer,
          fileOriginalName,
          fileMimeType
        )

        if (!videoUploadResult.success) {
          draft.status = 'failed'
          draft.error_message = videoUploadResult.message
          await draft.save()

          return res.status(500).json({
            error: videoUploadResult.message,
            details: videoUploadResult.error || 'Failed to upload video to S3',
          })
        }

        // Generate and upload thumbnail
        const thumbnailBuffer = await generateVideoThumbnail(outputPath)
        thumbnailUploadResult = await uploadImageToS3(
          `${fileOriginalName}_thumbnail`,
          'image/png',
          thumbnailBuffer,
          'video_thumbnails'
        )

        if (!thumbnailUploadResult.success) {
          draft.status = 'failed'
          draft.error_message = 'Failed to upload thumbnail'
          await draft.save()

          return res.status(500).json({ message: 'Failed to upload thumbnail' })
        }
      }

      // Create the actual video record
      console.log('📝 Draft data during video creation:', draft.draft_data)
      console.log('🎬 Series ID from draft:', draft.draft_data.series_id)
      console.log('💰 Amount from draft:', draft.draft_data.amount)
      console.log('🎭 Type from draft:', draft.draft_data.type)
      
      const longVideo = new LongVideo({
        name:
          draft.draft_data.name ||
          draft.video_data?.original_filename ||
          'Untitled Video',
        description: draft.draft_data.description || 'No description provided',
        videoUrl: videoUploadResult.url,
        thumbnailUrl: thumbnailUploadResult.url,
        created_by: userId,
        updated_by: userId,
        community: draft.draft_data.community_id || null,
        genre: draft.draft_data.genre || 'Action',
        type: draft.draft_data.type || 'Free',
        amount: draft.draft_data.amount || 0,
        series: draft.draft_data.series_id || null,
        age_restriction: draft.draft_data.age_restriction || false,
        Videolanguage: draft.draft_data.language || 'English',
        start_time: draft.draft_data.start_time || 0,
        display_till_time: draft.draft_data.display_till_time || 0,
      })

      await longVideo.save()
      console.log(`📹 Video created successfully with ID: ${longVideo._id}`)

      // Update community if specified
      if (draft.draft_data.community_id) {
        await Community.findByIdAndUpdate(draft.draft_data.community_id, {
          $push: { long_videos: longVideo._id },
          $addToSet: { creators: userId },
        })
      }

      // If video belongs to a series, add it to the series episodes
      console.log('🔍 Checking for series integration. Series ID:', draft.draft_data.series_id)
      if (draft.draft_data.series_id) {
        try {
          console.log(`🎬 Processing series integration for draft video with series ${draft.draft_data.series_id}`)
          const Series = require('../models/Series')
          const mongoose = require('mongoose')
          
          // Validate ObjectId
          if (!mongoose.Types.ObjectId.isValid(draft.draft_data.series_id)) {
            console.error(`❌ Invalid series ObjectId: ${draft.draft_data.series_id}`)
            throw new Error('Invalid series ID format')
          }
          
          // Get the series to check if it exists and get current episode count
          const series = await Series.findById(draft.draft_data.series_id)
          console.log(`📺 Found series:`, series ? series.title : 'Not found')
          console.log(`👤 Series creator: ${series?.created_by}, Video creator: ${userId}`)
          console.log(`📊 Current total episodes: ${series?.total_episodes || 0}`)
          if (series && series.created_by.toString() === userId.toString()) {
            // Calculate next episode number
            const nextEpisodeNumber = (series.total_episodes || 0) + 1
            console.log(`🔢 Assigning episode number: ${nextEpisodeNumber}`)
            
            // Update the video with episode information
            await LongVideo.findByIdAndUpdate(longVideo._id, {
              episode_number: nextEpisodeNumber,
              season_number: 1, // Default to season 1
              is_standalone: false
            })
            
            // Add video to series episodes and update analytics
            const seriesUpdateResult = await Series.findByIdAndUpdate(draft.draft_data.series_id, {
              $addToSet: { episodes: longVideo._id },
              $inc: {
                total_episodes: 1,
                'analytics.total_likes': longVideo.likes || 0,
                'analytics.total_views': longVideo.views || 0,
                'analytics.total_shares': longVideo.shares || 0,
              },
              $set: { 'analytics.last_analytics_update': new Date() },
            }, { new: true })
            
            console.log('📊 Series update result:', seriesUpdateResult ? 'Success' : 'Failed')
            
            // Verify the update worked
            const updatedSeries = await Series.findById(draft.draft_data.series_id)
            console.log(`✅ Video ${longVideo._id} added to series ${draft.draft_data.series_id} as episode ${nextEpisodeNumber}`)
            console.log(`📊 Updated series total episodes: ${updatedSeries?.total_episodes}`)
            console.log(`📋 Updated series episodes array length: ${updatedSeries?.episodes?.length}`)
          } else {
            console.error(`❌ Series ${draft.draft_data.series_id} not found or user ${userId} not authorized`)
          }
        } catch (seriesError) {
          console.error('❌ Error adding video to series:', seriesError)
          // Don't fail the entire upload, just log the error
        }
      }

      // Mark draft as completed and remove from user's drafts
      draft.status = 'completed'
      await draft.save()

      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: draft._id },
      })

      // Clean up draft after successful completion
      setTimeout(() => {
        Draft.findByIdAndDelete(draft._id).catch(console.error)
      }, 60000) // Delete after 1 minute

      res.status(200).json({
        message: 'Video uploaded successfully from draft',
        videoId: longVideo._id,
        draftId: draft._id,
        videoUrl: videoUploadResult.url,
        thumbnailUrl: thumbnailUploadResult.url,
        videoS3Key: videoUploadResult.key,
        thumbnailS3Key: thumbnailUploadResult.key,
        videoData: {
          name: longVideo.name,
          description: longVideo.description,
          genre: longVideo.genre,
          type: longVideo.type,
          language: longVideo.Videolanguage,
          age_restriction: longVideo.age_restriction,
          start_time: longVideo.start_time,
          display_till_time: longVideo.display_till_time,
        },
      })
    } catch (uploadError) {
      draft.status = 'failed'
      draft.error_message = uploadError.message
      await draft.save()
      throw uploadError
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Delete a draft
const deleteDraft = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const draft = await Draft.findOne({ _id: id, user_id: userId })

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    // Remove from user's drafts array
    await User.findByIdAndUpdate(userId, {
      $pull: { drafts: draft._id },
    })

    // Delete the draft
    await draft.deleteOne()

    res.status(200).json({
      message: 'Draft deleted successfully',
      deletedDraftId: id,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Get draft upload stats
const getDraftUploadStats = async (req, res, next) => {
  try {
    const userId = req.user.id

    const stats = await Draft.aggregate([
      { $match: { user_id: userId } },
      {
        $group: {
          _id: { $toLower: '$status' },
          count: { $sum: 1 },
        },
      },
    ])

    const result = {
      uploading: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      draft: 0,
    }

    stats.forEach((stat) => {
      result[stat._id] = stat.count
    })

    return res.status(200).json({
      message: 'Draft upload stats retrieved successfully',
      stats: result,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Clean up expired drafts (can be called by a cron job)
const cleanupExpiredDrafts = async (req, res, next) => {
  try {
    const expiredDrafts = await Draft.find({
      expires_at: { $lt: new Date() },
    })

    const expiredDraftIds = expiredDrafts.map((draft) => draft._id)
    const userIds = [...new Set(expiredDrafts.map((draft) => draft.user_id))]

    // Remove expired drafts
    await Draft.deleteMany({ _id: { $in: expiredDraftIds } })

    // Remove from users' draft arrays
    await User.updateMany(
      { _id: { $in: userIds } },
      { $pull: { drafts: { $in: expiredDraftIds } } }
    )

    res.status(200).json({
      message: 'Expired drafts cleaned up successfully',
      removedCount: expiredDraftIds.length,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  createOrUpdateDraft,
  getUserDrafts,
  getDraftById,
  completeDraftUpload,
  deleteDraft,
  getDraftUploadStats,
  cleanupExpiredDrafts,
  uploadVideoToDraft,
  removeVideoFromDraft,
}
