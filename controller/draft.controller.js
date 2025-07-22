const Draft = require('../models/Draft')
const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const Community = require('../models/Community')
const { handleError, uploadVideoToS3, uploadImageToS3, generateVideoThumbnail } = require('../utils/utils')
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
      communityId,
      seriesId,
      start_time,
      display_till_time,
      contentType = 'video'
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
        status: 'draft'
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
      ...(display_till_time !== undefined && { display_till_time: Number(display_till_time) })
    }

    draft.draft_data = draftData
    await draft.save()

    // Add to user's drafts if new
    if (!draftId) {
      await User.findByIdAndUpdate(userId, {
        $addToSet: { drafts: draft._id }
      })
    }

    res.status(200).json({
      message: draftId ? 'Draft updated successfully' : 'Draft created successfully',
      draft: {
        id: draft._id,
        content_type: draft.content_type,
        status: draft.status,
        draft_data: draft.draft_data,
        last_modified: draft.last_modified,
        expires_at: draft.expires_at
      }
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
          community: draft.draft_data.community_id,
          series: draft.draft_data.series_id,
          error_message: draft.error_message
        })
      }
    }

    // Remove expired drafts
    if (expiredDraftIds.length > 0) {
      await Draft.deleteMany({ _id: { $in: expiredDraftIds } })
      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: { $in: expiredDraftIds } }
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
        hasMore: skip + validDrafts.length < (totalDrafts - expiredDraftIds.length)
      },
      stats: {
        totalDrafts: validDrafts.length,
        expiredRemoved: expiredDraftIds.length
      }
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
        $pull: { drafts: draft._id }
      })
      return res.status(410).json({ error: 'Draft has expired and was removed' })
    }

    res.status(200).json({
      message: 'Draft retrieved successfully',
      draft: {
        id: draft._id,
        content_type: draft.content_type,
        status: draft.status,
        draft_data: draft.draft_data,
        last_modified: draft.last_modified,
        expires_at: draft.expires_at,
        error_message: draft.error_message,
        created_at: draft.createdAt,
        updated_at: draft.updatedAt
      }
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
    const videoFile = req.files?.videoFile?.[0]

    const draft = await Draft.findOne({ _id: id, user_id: userId })
    
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    if (draft.isExpired()) {
      await draft.deleteOne()
      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: draft._id }
      })
      return res.status(410).json({ error: 'Draft has expired and was removed' })
    }

    if (!videoFile) {
      return res.status(400).json({ error: 'Video file is required to complete upload' })
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

      // Compress video
      draft.status = 'processing'
      await draft.save()

      const {
        compressedVideoBuffer,
        outputPath,
        fileOriginalName,
        fileMimeType,
      } = await videoCompressor(videoFile)

      // Upload to S3
      const videoUploadResult = await uploadVideoToS3(
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
      const thumbnailUploadResult = await uploadImageToS3(
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

      // Create the actual video record
      const longVideo = new LongVideo({
        name: draft.draft_data.name || videoFile.originalname || 'Untitled Video',
        description: draft.draft_data.description || 'No description provided',
        videoUrl: videoUploadResult.url,
        thumbnailUrl: thumbnailUploadResult.url,
        created_by: userId,
        updated_by: userId,
        community: draft.draft_data.community_id || null,
        genre: draft.draft_data.genre || 'Action',
        type: draft.draft_data.type || 'Free',
        series: draft.draft_data.series_id || null,
        age_restriction: draft.draft_data.age_restriction || false,
        Videolanguage: draft.draft_data.language || 'English',
        start_time: draft.draft_data.start_time || 0,
        display_till_time: draft.draft_data.display_till_time || 0,
      })

      await longVideo.save()

      // Update community if specified
      if (draft.draft_data.community_id) {
        await Community.findByIdAndUpdate(draft.draft_data.community_id, {
          $push: { long_videos: longVideo._id }
        })
      }

      // Mark draft as completed and remove from user's drafts
      draft.status = 'completed'
      await draft.save()

      await User.findByIdAndUpdate(userId, {
        $pull: { drafts: draft._id }
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
        }
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
      $pull: { drafts: draft._id }
    })

    // Delete the draft
    await draft.deleteOne()

    res.status(200).json({
      message: 'Draft deleted successfully',
      deletedDraftId: id
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
          count: { $sum: 1 }
        }
      }
    ])

    const result = {
      uploading: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      draft: 0
    }
    
    stats.forEach(stat => {
      result[stat._id] = stat.count
    })
    
    return res.status(200).json({
      message: 'Draft upload stats retrieved successfully',
      stats: result
    })

  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Clean up expired drafts (can be called by a cron job)
const cleanupExpiredDrafts = async (req, res, next) => {
  try {
    const expiredDrafts = await Draft.find({
      expires_at: { $lt: new Date() }
    })

    const expiredDraftIds = expiredDrafts.map(draft => draft._id)
    const userIds = [...new Set(expiredDrafts.map(draft => draft.user_id))]

    // Remove expired drafts
    await Draft.deleteMany({ _id: { $in: expiredDraftIds } })

    // Remove from users' draft arrays
    await User.updateMany(
      { _id: { $in: userIds } },
      { $pull: { drafts: { $in: expiredDraftIds } } }
    )

    res.status(200).json({
      message: 'Expired drafts cleaned up successfully',
      removedCount: expiredDraftIds.length
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
  cleanupExpiredDrafts
}
