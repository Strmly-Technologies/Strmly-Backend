const Community = require('../models/Community')
const CommunityAccess = require('../models/CommunityAccess')
const LongVideo = require('../models/LongVideo')
const User = require('../models/User')
const { handleError, uploadImageToS3 } = require('../utils/utils')
const { checkCreatorPassAccess } = require('../controller/creatorpass.controller')
const UserAccess = require('../models/UserAccess')
const { checkAccess } = require('../utils/access')


const CreateCommunity = async (req, res, next) => {
  const { name, bio, type, amount, fee_description } = req.body
  const userId = req.user.id

  if (!name) {
    return res.status(400).json({ message: 'Name is required' })
  }
  if (!type || !['free', 'paid'].includes(type)) {
    return res.status(400).json({
      message: 'Community type must be "free" or "paid"',
    })
  }

  if (type === 'paid' && !amount) {
    return res.status(400).json({
      message: 'Community fee amount must be provided for paid communities',
    })
  }

  try {
    const newCommunity = new Community({
      name,
      bio: bio || '',
      founder: userId,
      followers: [userId],
      creators: [userId],
      creator_join_order: [
        {
          user: userId,
          joined_at: new Date(),
        },
      ],
      community_fee_type: type,
      community_fee_amount: type === 'paid' ? amount || 0 : 0,
      community_fee_description: type === 'paid' ? fee_description || '' : '',
    })

    await newCommunity.save()

    res.status(201).json({
      message: 'Community created successfully',
      community: newCommunity,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const RenameCommunity = async (req, res, next) => {
  const { communityId, newName } = req.body
  const userId = req.user.id
  if (!communityId || !newName) {
    return res
      .status(400)
      .json({ message: 'Community ID and new name are required' })
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, founder: userId },
      { name: newName },
      { new: true }
    )

    if (!updatedCommunity) {
      return res
        .status(404)
        .json({ message: 'Community not found or you are not the founder' })
    }

    res.status(200).json({
      message: 'Community renamed successfully',
      community: updatedCommunity,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const ChangeCommunityProfilePhoto = async (req, res, next) => {
  const profilePhotoFile = req.files?.imageFile?.[0]
  const { communityId } = req.body
  const userId = req.user.id.toString()

  if (!communityId || !profilePhotoFile) {
    return res
      .status(400)
      .json({ message: 'Community ID and profile photo are required' })
  }

  try {
    const community = await Community.findOne({
      _id: communityId,
      founder: userId,
    })
    if (!community) {
      return res
        .status(404)
        .json({ message: 'Community not found or you are not the founder' })
    }

    const uploadResult = await uploadImageToS3(
      profilePhotoFile.originalname,
      profilePhotoFile.mimetype,
      profilePhotoFile.buffer,
      'community-profile-photos'
    )
    if (!uploadResult.success) {
      console.error(' S3 upload failed:', uploadResult)
      return res.status(500).json({
        error: uploadResult.message,
        details: uploadResult.error || 'Failed to upload image to S3',
      })
    }

    const profilePhotoUrl = uploadResult.url

    community.profile_photo = profilePhotoUrl
    await community.save()

    res.status(200).json({
      message: 'Community profile photo updated successfully',
      community: community,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const FollowCommunity = async (req, res, next) => {
  const { communityId } = req.body
  const userId = req.user.id.toString()

  if (!communityId) {
    return res.status(400).json({ message: 'Community ID is required' })
  }

  try {
    const user = await User.findById(userId).select('following_communities')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const community = await Community.findById(communityId).populate(
      'founder',
      'username profile_photo'
    )
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    const result = await User.updateOne(
      { _id: userId, following_communities: { $ne: communityId } },
      { $addToSet: { following_communities: communityId } }
    )

    if (result.modifiedCount === 0) {
      return res
        .status(400)
        .json({ message: 'User is already following this community.' })
    }
    // Add to followers
    await Community.updateOne(
      { _id: communityId },
      {
        $addToSet: {
          followers: userId,
          creators: userId,
        },
        $set: { 'analytics.last_analytics_update': new Date() },
      }
    )

    // Add user to creator join order if not already present
    community.addCreatorToJoinOrder(userId)
    await community.save()

    res.status(200).json({
      message: 'Successfully followed the community',
      isFollowingCommunity: true,
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
    await User.findByIdAndUpdate(userId, {
      $pull: { community: communityId },
    })
    return res.status(200).json({
      message: 'Successfully unfollowed the community',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}
const AddBioToCommunity = async (req, res, next) => {
  const { communityId, bio } = req.body
  const userId = req.user.id

  if (!communityId || !bio) {
    return res
      .status(400)
      .json({ message: 'Community ID and bio are required' })
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, founder: userId },
      { bio },
      { new: true }
    )

    if (!updatedCommunity) {
      return res
        .status(404)
        .json({ message: 'Community not found or you are not the founder' })
    }

    res.status(200).json({
      message: 'Bio added to community successfully',
      community: updatedCommunity,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const checkCommunityUploadPermission = async (userId, communityId) => {
  const community = await Community.findById(communityId)

  if (!community) {
    return { hasPermission: false, error: 'Community not found' }
  }

  // Community founder always has permission
  if (community.founder.toString() === userId) {
    return { hasPermission: true, accessType: 'founder' }
  }

  // Check if community is free
  if (community.community_fee_type === 'free') {
    return { hasPermission: true, accessType: 'free' }
  }

  // Check paid access with expiry validation
  const access = await CommunityAccess.findOne({
    user_id: userId,
    community_id: communityId,
  })

  if (!access) {
    return {
      hasPermission: false,
      error: 'Monthly subscription required to upload content',
      requiredFee: community.community_fee_amount,
      communityName: community.name,
      subscriptionInfo:
        'Monthly subscription provides 30 days of upload access',
    }
  }

  // Check if access is expired
  if (access.isExpired()) {
    // Update status to expired
    access.status = 'expired'
    access.subscription_status = 'expired'
    await access.save()

    return {
      hasPermission: false,
      error: 'Your community subscription has expired',
      requiredFee: community.community_fee_amount,
      communityName: community.name,
      expiredAt: access.expires_at,
      renewalRequired: true,
    }
  }

  // Check if access is active
  if (access.status !== 'active') {
    return {
      hasPermission: false,
      error: 'Community access is not active',
      accessStatus: access.status,
    }
  }

  return {
    hasPermission: true,
    accessType: 'paid',
    access,
    expiresAt: access.expires_at,
    daysRemaining: Math.ceil(
      (access.expires_at - new Date()) / (1000 * 60 * 60 * 24)
    ),
  }
}

const getAllCommunities = async (req, res, next) => {
  try {
    const communities = await Community.find()
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo')
      .populate('long_videos', 'name description videoUrl thumbnailUrl')
      .populate('series', 'title description total_episodes')
    if (communities.length === 0) {
      return res.status(404).json({ message: 'No communities found' })
    }

    return res.status(200).json({
      communities,
      count: communities.length,
      message: 'Communities fetched successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getCommunityById = async (req, res, next) => {
  const communityId = req.params.id
  try {
    const community = await Community.findById(communityId)
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo')
      .populate('long_videos', 'name description videoUrl thumbnailUrl')
      .populate('series', 'title description total_episodes')

    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    const userId = req.user.id
    if (!userId) {
      return res.status(200).json(community)
    }
    community.isFollowing = community.followers.includes(userId)
    community.isCreator = community.creators.includes(userId)
    community.isFounder = community.founder._id.toString() === userId
    community.fee =
      community.community_fee_type === 'paid'
        ? {
            type: community.community_fee_type,
            amount: community.community_fee_amount,
          }
        : null
    community.canUpload = await checkCommunityUploadPermission(
      userId,
      communityId
    )
    if (!community.canUpload.hasPermission) {
      community.uploadError = community.canUpload.error
      community.requiredFee = community.canUpload.requiredFee
      community.communityName = community.canUpload.communityName
    }
    if (community.canUpload.access) {
      community.access = {
        status: community.canUpload.access.status,
        expiresAt: community.canUpload.access.expires_at,
        daysRemaining: community.canUpload.daysRemaining,
      }
    }
    return res.status(200).json(community)
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserCommunities = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { type = 'all' } = req.query

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' })
    }

    let created = []
    let joined = []

    if (type === 'created' || type === 'all') {
      created = await Community.find({ founder: userId })
        .populate('founder', 'username profile_photo')
        .populate('followers', 'username profile_photo')
        .populate('creators', 'username profile_photo')
        .populate('long_videos', 'name description videoUrl thumbnailUrl')

        .populate('series', 'title description total_episodes')
    }

    if (type === 'joined' || type === 'all') {
      joined = await Community.find({ followers: userId })
        .populate('founder', 'username profile_photo')
        .populate('followers', 'username profile_photo')
        .populate('creators', 'username profile_photo')
        .populate('long_videos', 'name description videoUrl thumbnailUrl')

        .populate('series', 'title description total_episodes')
    }

    let combined = []

    if (type === 'all') {
      const combinedMap = new Map()

      ;[...created, ...joined].forEach((comm) => {
        combinedMap.set(comm._id.toString(), comm)
      })

      combined = Array.from(combinedMap.values())
    }

    res.status(200).json({
      communities:
        type === 'created' ? created : type === 'joined' ? joined : combined,
      createdCount: created.length,
      joinedCount: joined.length,
      totalCount:
        type === 'all'
          ? combined.length
          : type === 'created'
            ? created.length
            : joined.length,
      message: 'Communities fetched successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUploadPermissionForCommunity = async (req, res, next) => {
  try {
    const { communityId } = req.body
    const userId = req.user.id
    if (!communityId) {
      return res.status(400).json({ message: 'Community ID is required' })
    }
    const permission = await checkCommunityUploadPermission(userId, communityId)
    if (!permission.hasPermission) {
      return res.status(403).json({
        message:
          permission.error || 'You do not have permission to upload content',
        requiredFee: permission.requiredFee,
        communityName: permission.communityName,
      })
    }
    return res.status(200).json({
      message: 'You have permission to upload content',
      accessType: permission.accessType,
      access: permission.access || null,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getCommunityProfileDetails = async (req, res, next) => {
  try {
    const communityId = req.params.id
    if (!communityId) {
      return res
        .status(400)
        .json({ message: 'Community ID is required to proceed' })
    }
    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }
    const totalFollowers = community.followers.length
    const totalCreators = community.creators.length
    const totalVideos = community.long_videos.length + community.series.length
    const totalContent = {
      longVideos: community.long_videos.length,
      series: community.series.length,
    }
    return res.status(200).json({
      communityId: community._id,
      name: community.name,
      bio: community.bio,
      profilePhoto: community.profile_photo,
      totalFollowers,
      totalCreators,
      totalVideos,
      totalContent,
      founder: {
        id: community.founder._id,
        username: community.founder.username,
        profilePhoto: community.founder.profile_photo,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getCommunityVideos = async (req, res, next) => {
  try {
    const communityId = req.params.id
    const { videoType } = req.query
    const userId = req.user?.id

    if (!communityId) {
      return res.status(400).json({ message: 'Community ID is required' })
    }

    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    let videos = []
    
    // Get current user's following list if user is authenticated
    let followingIds = [];
    if (userId) {
      const user = await User.findById(userId).select('following');
      if (user && user.following) {
        followingIds = user.following.map(id => id.toString());
      }
    }

    if (videoType === 'long') {
      const populated = await Community.findById(communityId).populate({
        path: 'long_videos',
        match: { visibility: { $ne: 'hidden' } },
        populate: [
          {
            path: 'created_by',
            select: 'username profile_photo custom_name',
          },
          {
            path: 'community',
            select: 'name profile_photo followers',
          },
          {
            path: 'series',
            populate: {
              path: 'episodes',
              select: 'name episode_number season_number thumbnailUrl views likes',
              options: { sort: { season_number: 1, episode_number: 1 } },
            },
          }
        ]
      })
      
      videos = populated.long_videos || [];
      
      // Add computed fields and check access for user
      if (userId && videos.length > 0) {
        const processedVideos = [];
        
        for (let i = 0; i < videos.length; i++) {
          const videoObj = videos[i].toObject();
          
          // Add following status
          if (videos[i].created_by) {
            videoObj.is_following_creator = followingIds.includes(videos[i].created_by._id.toString());
          }
          
          // Add community following status
          if (videos[i].community && videos[i].community.followers) {
            videoObj.is_following_community = videos[i].community.followers.some(
              followerId => followerId.toString() === userId
            );
          }
          
          // Add access information
          const processedVideo = await checkAccess(videoObj, userId);
          processedVideos.push(processedVideo);
        }
        
        videos = processedVideos;
      }
    } else if (videoType === 'series') {
      const populated = await Community.findById(communityId).populate({
        path: 'series',
        populate: [
          {
            path: 'created_by',
            select: 'username profile_photo custom_name',
          },
          {
            path: 'episodes',
            select: 'name episode_number season_number thumbnailUrl views likes created_by videoUrl',
            populate: {
              path: 'created_by',
              select: 'username profile_photo custom_name',
            },
            options: { sort: { season_number: 1, episode_number: 1 } },
          }
        ]
      })
      
      videos = populated.series || [];
      
      // For series we could add similar computed fields if needed
    } else {
      return res.status(400).json({ message: 'Invalid video type' })
    }

    return res.status(200).json({
      videos,
      count: videos.length,
      message:
        videos.length === 0
          ? 'No videos found in this community'
          : 'Videos fetched successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTrendingCommunityVideos = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, communityId } = req.query

    const skip = (page - 1) * limit
    const limitNum = parseInt(limit)

    let query = { visibility: { $ne: 'hidden' } }
    if (communityId) {
      query.community = communityId
    }

    let trendingVideos = []

    const longVideos = await LongVideo.find(query)
      .populate('created_by', 'username profile_photo')
      .populate('community', 'name profile_photo')
      .sort({ likes: -1, views: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)

    trendingVideos = trendingVideos.concat(
      longVideos.map((video) => ({
        ...video.toObject(),
      }))
    )

    // Get total counts for pagination
    const totalLongVideos = await LongVideo.countDocuments(query)

    res.status(200).json({
      message: 'Trending community videos retrieved successfully',
      videos: trendingVideos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalLongVideos / limitNum),
        totalLongVideos,
        limit: limitNum,
        hasMore: parseInt(page) < Math.ceil(totalLongVideos / limitNum),
      },
      filters: {
        communityId: communityId || 'all',
        sortBy: 'likes_desc',
      },
      stats: {
        totalLongVideos,
        totalCommunities: communityId ? 1 : await Community.countDocuments(),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTrendingVideosByCommunity = async (req, res, next) => {
  try {
    const { id: communityId } = req.params
    const { page = 1, limit = 10, sortBy = 'likes' } = req.query

    const skip = (page - 1) * limit
    const limitNum = parseInt(limit)

    // Check if community exists
    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    let sortObject = {}
    switch (sortBy) {
      case 'likes':
        sortObject = { likes: -1, views: -1, createdAt: -1 }
        break
      case 'views':
        sortObject = { views: -1, likes: -1, createdAt: -1 }
        break
      case 'recent':
        sortObject = { createdAt: -1, likes: -1, views: -1 }
        break
      default:
        sortObject = { likes: -1, views: -1, createdAt: -1 }
    }

    let trendingVideos = []

    const longVideos = await LongVideo.find({
      community: communityId,
      visibility: { $ne: 'hidden' },
    })
      .populate('created_by', 'username profile_photo')
      .populate('community', 'name profile_photo')
      .sort(sortObject)
      .skip(skip)
      .limit(limitNum)

    trendingVideos = trendingVideos.concat(
      longVideos.map((video) => ({
        ...video.toObject(),
      }))
    )

    trendingVideos.sort((a, b) => {
      switch (sortBy) {
        case 'views':
          if (b.views !== a.views) return b.views - a.views
          if (b.likes !== a.likes) return b.likes - a.likes
          return new Date(b.createdAt) - new Date(a.createdAt)
        case 'recent':
          return new Date(b.createdAt) - new Date(a.createdAt)
        default: // likes
          if (b.likes !== a.likes) return b.likes - a.likes
          if (b.views !== a.views) return b.views - a.views
          return new Date(b.createdAt) - new Date(a.createdAt)
      }
    })

    trendingVideos = trendingVideos.slice(skip, skip + limitNum)

    // Get totals for this community
    const totalLongVideos = await LongVideo.countDocuments({
      community: communityId,
      visibility: { $ne: 'hidden' },
    })

    res.status(200).json({
      message: `Trending videos from ${community.name} retrieved successfully`,
      community: {
        id: community._id,
        name: community.name,
        profilePhoto: community.profile_photo,
        followers: community.followers.length,
      },
      videos: trendingVideos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalLongVideos / limitNum),
        totalLongVideos,
        limit: limitNum,
        hasMore: parseInt(page) < Math.ceil(totalLongVideos / limitNum),
      },
      filters: {
        sortBy,
        communityId,
      },
      stats: {
        totalLongVideos,
        communityFollowers: community.followers.length,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getListOfCreators = async (req, res, next) => {
  const { communityId } = req.params
  const userId = req.user.id
  if (!communityId) {
    return res.status(400).json({ message: 'Community ID is required' })
  }
  try {
    const community = await Community.findById(communityId).populate(
      'creators',
      'username profile_photo'
    )
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }
    if (!community.creators.includes(userId)) {
      return res
        .status(403)
        .json({ message: 'You are not a creator of this community' })
    }
    return res.status(200).json({
      message: 'Creators fetched successfully',
      creators: community.creators,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const changeCommunityFounder = async (req, res, next) => {
  const { communityId, newFounderId } = req.body
  const userId = req.user.id
  if (!communityId || !newFounderId) {
    return res
      .status(400)
      .json({ message: 'Community ID and new founder ID are required' })
  }

  try {
    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }

    // check if user is the founder
    if (community.founder.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: 'Only the current founder can change the founder' })
    }

    // check if new founder exists and is a creator
    const newFounder = await User.findById(newFounderId)
    if (!newFounder) {
      return res.status(404).json({ message: 'New founder not found' })
    }

    if (!community.creators.includes(newFounderId)) {
      return res.status(400).json({
        message: 'New founder must be a creator in the community',
      })
    }

    // update the community founder
    community.founder = newFounderId
    await community.save()

    res.status(200).json({
      message: 'Community founder changed successfully',
      community,
      newFounder: {
        id: newFounderId,
        username: newFounder.username,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const makeFirstJoinedCreatorFounder = async (req, res, next) => {
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
    if (!community.creators.includes(userId)) {
      return res
        .status(403)
        .json({ message: 'You are not a creator of this community' })
    }
    if (community.founder.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: 'Only the current founder can change the founder' })
    }

    // Get next founder in succession
    const nextFounderId = community.getNextFounder(userId)
    if (!nextFounderId) {
      return res.status(404).json({
        message: 'No other active creators available to become founder',
      })
    }

    // update the community founder
    community.founder = nextFounderId
    await community.save()

    const newFounder = await User.findById(nextFounderId).select('username')

    res.status(200).json({
      message: 'Community founder changed to next creator in succession',
      community,
      newFounder: {
        id: nextFounderId,
        username: newFounder.username,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Add new method to handle founder leaving
const handleFounderLeaving = async (communityId, currentFounderId) => {
  const community = await Community.findById(communityId)
  if (!community) {
    throw new Error('Community not found')
  }

  // Get next founder in succession
  const nextFounderId = community.getNextFounder(currentFounderId)

  if (!nextFounderId) {
    // No other creators available, community will be deleted
    return null
  }

  // Update founder
  community.founder = nextFounderId

  // Remove the leaving founder from creators and join order
  community.creators = community.creators.filter(
    (creatorId) => creatorId.toString() !== currentFounderId.toString()
  )
  community.removeCreatorFromJoinOrder(currentFounderId)

  await community.save()

  return nextFounderId
}

const getCommunityFollowingStatus = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { id } = req.params
    const community = await Community.findById(id).select('followers')
    if (!community) {
      res.status(404).json({
        error: 'Community not found',
      })
    }
    const status =
      community.followers?.some((follower) => follower.toString() === userId) ||
      false
    res.status(200).json({
      message: 'community following status retrieved successfully',
      status,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  getCommunityProfileDetails,
  getAllCommunities,
  getCommunityById,
  getUserCommunities,
  FollowCommunity,
  CreateCommunity,
  RenameCommunity,
  ChangeCommunityProfilePhoto,
  AddBioToCommunity,
  checkCommunityUploadPermission,
  getUploadPermissionForCommunity,
  getTrendingCommunityVideos,
  getTrendingVideosByCommunity,
  getCommunityVideos,
  getListOfCreators,
  changeCommunityFounder,
  makeFirstJoinedCreatorFounder,
  handleFounderLeaving,
  getCommunityFollowingStatus,
  checkAccess,
}
