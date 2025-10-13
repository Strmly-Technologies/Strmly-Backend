const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const Community = require('../models/Community')
const Series = require('../models/Series')
const { handleError } = require('../utils/utils')
const { handleFounderLeaving } = require('./community.controller')
const Report = require('../models/Report')
const {
  sendAccountDeletionRequestEmail,
  sendDeletionRequestEmailToUser,
} = require('../utils/email')
const { s3 } = require('../config/AWS')
const uuidv4 = require('uuid').v4

const DeleteLongVideo = async (req, res, next) => {
  const { videoId } = req.params
  const userId = req.user.id

  try {
    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
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
            newFounderId: nextFounderId,
          })
        } else {
          // No successor found, delete the community
          await Community.findByIdAndDelete(community._id)
        }
      } catch (error) {
        console.error(
          `Error handling founder succession for community ${community._id}:`,
          error
        )
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
          creator_join_order: { user: userId },
        },
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
      communityUpdates:
        communityUpdates.length > 0
          ? {
              message: `Founder role transferred in ${communityUpdates.length} communities`,
              updates: communityUpdates,
            }
          : null,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// const sendEmailForDeletion=async(req,res,next)=>{
//   const userId = req.user.id
//   try {
//     const user = await User.findById(userId)
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' })
//     }

//     const emailResult=await sendEmailForDeletion(
//       user.email,
//       user.username,
//     )

//     res.status(200).json({ message: 'Deletion email sent successfully' })
//   }
// }

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
  const userId = req.user.id.toString()

  if (!communityId) {
    return res.status(400).json({ message: 'Community ID is required' })
  }

  try {
    const community = await Community.findById(communityId).populate(
      'founder',
      'username profile_photo'
    )
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

    await User.findByIdAndUpdate(userId, {
      $pull: { following_communities: communityId },
    })

    res.status(200).json({
      message: 'Successfully unfollowed the community',
      isFollowingCommunity: false,
      community: {
        name: community.name,
        profilePhoto: community.profile_photo,
        founder: {
          id: community.founder._id.toString(),
          username: community.founder.username,
          profilePhoto: community.founder.profile_photo,
        },
      },
    })
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
      return res.status(400).json({
        message:
          'Cannot remove the founder from the community. Transfer founder role first.',
      })
    }

    // Remove user from community and join order
    await Community.findByIdAndUpdate(communityId, {
      $pull: {
        followers: targetUserId,
        creators: targetUserId,
        creator_join_order: { user: targetUserId },
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
        message: 'Only the founder can leave their own community',
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
        message:
          'You left the community. Since no other creators were available, the community was deleted.',
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
        username: newFounder.username,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const reportUser=async(req,res,next)=>{
  const userId=req.user.id
  const {targetUserId,reason,description}=req.body
  
  if(!targetUserId || !reason){
    return res.status(400).json({message:'Target user ID and reason are required'})
  }
  
  try {
    const targetUser=await User.findById(targetUserId)
    if(!targetUser){
      return res.status(404).json({message:'Target user not found'})
    }
    
    // Check for existing report
    const existingReport=await Report.findOne({
      reporter_id:userId,
      content_type:'user',
      content_id:targetUserId
    })
    
    if(existingReport){
      return res.status(400).json({
        success:false,
        message:'You have already reported this user'
      })
    }
    
    const report=new Report({
      reporter_id:userId,
      content_id:targetUserId,
      content_type:'user',
      reason,
      description
    })
    
    await report.save()
    
    res.status(201).json({
      success:true,
      message:'User reported successfully',
      report:{
        id:report._id,
        content_type:report.content_type,
        reason:report.reason,
        status:report.status,
        createdAt:report.createdAt
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const reportContent = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { contentId, contentype, reason, description } = req.body;
    
    if (!contentId || !contentype || !reason) {
      return res.status(400).json({ 
        message: 'Content ID, type and reason are required' 
      });
    }
    
    // Check for existing report
    const existingReport = await Report.findOne({
      reporter_id: userId,      
      content_type: contentype,  
      content_id: contentId,    
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this content',
      });
    }
    
    // Handle uploaded images
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadPromises = req.files.map(file => {
          const imageKey = `report-evidence/${uuidv4()}-${file.originalname}`;
          return s3.upload({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: imageKey,
            Body: file.buffer,
            ContentType: file.mimetype,
          }).promise().then(() => {
            return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`;
          });
        });
        imageUrls = await Promise.all(uploadPromises);
      } catch (uploadError) {
        // If any upload fails, throw to be caught by outer catch
        throw new Error('Failed to upload one or more evidence images to S3.');
      }
    }
    
    // Create and save the report
    const report = new Report({
      reporter_id: userId,
      content_id: contentId,
      content_type: contentype,
      reason,
      description,
      evidence_images: imageUrls
    });
    
    await report.save();
    
    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report: {
        id: report._id,
        content_type: report.content_type,
        reason: report.reason,
        status: report.status,
        evidence_images: report.evidence_images,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const getUserReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status = 'all' } = req.query
    const skip = (page - 1) * limit
    const reporter_id = req.user.id

    let query = { reporter_id }
    if (status !== 'all') {
      query.status = status
    }

    const reports = await Report.find(query)
      .populate('content_id', 'name title username') // Dynamic population based on content_type
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const totalReports = await Report.countDocuments(query)

    res.status(200).json({
      success: true,
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalReports,
        pages: Math.ceil(totalReports / limit),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const requestAccountDeletion = async (req, res, next) => {
  const userId = req.user.id

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Check if user has already requested deletion
    if (user.account_status.is_deactivated) {
      return res.status(400).json({
        success: false,
        message: 'Account is already deactivated. Please contact support.',
      })
    }

    if (user.deletion_requested) {
      return res.status(400).json({
        success: false,
        message: 'Deletion request already exists',
        requestedAt: user.deletion_requested_at,
        estimatedDeletionDate: new Date(
          user.deletion_requested_at.getTime() + 30 * 24 * 60 * 60 * 1000
        ),
      })
    }

    // Check for active subscriptions or pending transactions
    const hasActiveCreatorPass = user.creator_profile?.creator_pass_price > 0
    if (hasActiveCreatorPass) {
      return res.status(400).json({
        success: false,
        message:
          'Cannot delete account with active Creator Pass. Please disable it first.',
        code: 'ACTIVE_CREATOR_PASS',
      })
    }

    user.deletion_requested = true
    user.deletion_requested_at = new Date()
    await user.save()

    // Send email to admin
    const deleteEmailResult = await sendAccountDeletionRequestEmail(
      user.email,
      user.username
    )
    if (!deleteEmailResult.success) {
      // Rollback the deletion request if email fails
      user.deletion_requested = false
      user.deletion_requested_at = null
      await user.save()

      return res.status(500).json({
        success: false,
        message: 'Failed to send account deletion request email',
        error: deleteEmailResult.error,
      })
    }

    // Send confirmation email to user
    const deletionRequestEmailResult = await sendDeletionRequestEmailToUser(
      user.email,
      user.username
    )
    if (!deletionRequestEmailResult.success) {
      console.error(
        'Failed to send user confirmation email:',
        deletionRequestEmailResult.error
      )
    }

    res.status(200).json({
      success: true,
      message: 'Account deletion request submitted successfully',
      deletionRequest: {
        requestedAt: user.deletion_requested_at,
        estimatedDeletionDate: new Date(
          user.deletion_requested_at.getTime() + 30 * 24 * 60 * 60 * 1000
        ),
        note: 'Your account will be deleted within 30-45 days. You can contact support to cancel this request.',
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const cancelAccountDeletionRequest = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { password } = req.body

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to cancel deletion request',
      })
    }

    const user = await User.findById(userId).select('+password')
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    if (!user.deletion_requested) {
      return res.status(400).json({
        success: false,
        message: 'No deletion request found to cancel',
      })
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password',
      })
    }

    // Check if still within cancellable period (e.g., 30 days)
    const daysSinceRequest =
      (new Date() - user.deletion_requested_at) / (1000 * 60 * 60 * 24)
    if (daysSinceRequest > 30) {
      return res.status(400).json({
        success: false,
        message:
          'Deletion request can no longer be cancelled. Please contact support.',
        daysSinceRequest: Math.floor(daysSinceRequest),
      })
    }

    // Cancel the deletion request
    user.deletion_requested = false
    user.deletion_requested_at = null
    await user.save()

    res.status(200).json({
      success: true,
      message: 'Account deletion request cancelled successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const BlockUser=async (req,res,next)=>{
  try {
    const userId=req.user.id
    const {targetId}=req.body
    
    if(!targetId){
      return res.status(400).json({
        success:false,
        message:"Target user ID is required"
      })
    }
    if(userId===targetId){
      return res.status(400).json({
        success:false,
        message:"You cannot block yourself"
      })
    }
    
    const user=await User.findById(userId)
    if(!user){
      return res.status(404).json({
        success:false,
        message:"User not found"
      })
    }
    const targetUser=await User.findById(targetId)
    if(!targetUser){
      return res.status(404).json({
        success:false,
        message:"Target user not found"
      })
    }
    if(user.blocked_users.includes(targetId)){
      return res.status(400).json({
        success:false,
        message:"User is already blocked"
      })
    }
    
    user.blocked_users.push(targetId)
    await user.save()
    
    return res.status(200).json({
      success:true,
      message:"User blocked successfully"
    })
  } catch (error) {
    console.error("Error blocking user:",error)
    return res.status(500).json({
      success:false,
      message:"An error occurred while blocking the user"
    })
  }
}

const UnblockUser=async (req,res,next)=>{
  try {
    const userId=req.user.id
    const {targetId}=req.body
    
    if(!targetId){
      return res.status(400).json({
        success:false,
        message:"Target user ID is required"
      })
    }
    if(userId===targetId){
      return res.status(400).json({
        success:false,
        message:"You cannot unblock yourself"
      })
    }
    
    const user=await User.findById(userId)
    if(!user){
      return res.status(404).json({
        success:false,
        message:"User not found"
      })
    }
    const targetUser=await User.findById(targetId)
    if(!targetUser){
      return res.status(404).json({
        success:false,
        message:"Target user not found"
      })
    }
    if(!user.blocked_users.includes(targetId)){
      return res.status(400).json({
        success:false,
        message:"User is not in your blocked list"
      })
    }
    
    user.blocked_users=user.blocked_users.filter(id=>id.toString()!==targetId)
    await user.save()
    
    return res.status(200).json({
      success:true,
      message:"User unblocked successfully"
    })
  } catch (error) {
    console.error("Error unblocking user:",error)
    return res.status(500).json({
      success:false,
      message:"An error occurred while unblocking the user"
    })
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
  removeFounderFromCommunity,
  reportContent,
  getUserReports,
  requestAccountDeletion,
  cancelAccountDeletionRequest,
  BlockUser,
  UnblockUser,
  reportUser
}
