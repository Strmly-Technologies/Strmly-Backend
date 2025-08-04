const User = require('../models/User')
const Community = require('../models/Community')
const LongVideo = require('../models/LongVideo')
const { handleError, uploadImageToS3 } = require('../utils/utils')
const UserAccess = require('../models/UserAccess')
const Reshare = require('../models/Reshare')
const { getRedisClient } = require('../config/redis')
const CreatorPass = require('../models/CreatorPass')
const Comment = require('../models/Comment')
const Series = require('../models/Series')
const GetUserFeed = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * (limit - 2)
    const resharedVideoSkip = (page - 1) * 2

    const user = await User.findById(userId)
      .populate('following', '_id')
      .populate('community', '_id')
      .select('following community interests viewed_videos')

    const followingIds = user.following.map((f) => f._id)
    const communityIds = user.community.map((c) => c._id)
    const viewedVideoIds = user.viewed_videos || []

    // Get feed videos from following and communities (excluding already viewed)
    const feedVideos = await LongVideo.find({
      $and: [
        {
          $or: [
            { created_by: { $in: followingIds } },
            { community: { $in: communityIds } },
          ],
        },
        { _id: { $nin: viewedVideoIds } },
      ],
    })
      .populate('created_by', 'username profile_photo')
      .populate('community', 'name profile_photo')
      .populate(
        'series',
        'title description price genre episodes seasons total_episodes'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit - 2))

    // Get personalized recommendations based on interests
    let recommendedVideos = []
    if (user.interests && user.interests.length > 0) {
      const userInterests = user.interests.slice(0, 3)

      recommendedVideos = await LongVideo.find({
        genre: { $in: userInterests },
        _id: { $nin: [...viewedVideoIds, ...feedVideos.map((v) => v._id)] },
        created_by: { $nin: followingIds }, // Exclude videos from followed users
      })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ views: -1, likes: -1 })
        .limit(3)
    }

    // Get reshared videos - Only from users that the current user follows
    const resharedVideos = await Reshare.find({
      user: { $in: followingIds }, // Only get reshares from followed users
    })
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
    console.log('Recommended videos from interests:', recommendedVideos)

    res.status(200).json({
      message: 'User feed retrieved successfully',
      feed: feedVideos,
      recommendedVideos,
      reshared: resharedVideos,
      userInterests: user.interests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feedVideos.length === parseInt(limit - 2),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserProfile = async (req, res, next) => {
  try {
    const userId = req.user._id

    const user = await User.findById(userId)
      .populate('followers', 'username profile_photo')
      .populate('following', 'username profile_photo')
      .populate('my_communities', 'name profile_photo')
      .select(
        '-password -saved_items -saved_videos -saved_series -playlist -history -liked_videos -video_frame'
      )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.status(200).json({
      message: 'User profile retrieved successfully',
      user,
      onboarding_completed: user.onboarding_completed,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const UpdateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user._id
    const {
      username,
      bio,
      date_of_birth,
      interests,
      uniqueId,
      content_interests,
    } = req.body
    const profilePhotoFile = req.file

    const updateData = {}
    if (username) updateData.username = username
    if (bio !== undefined) updateData.bio = bio
    if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth
    if (uniqueId) updateData.uniqueId = uniqueId
    if (content_interests) updateData.content_interests = content_interests

    // Parse interests from JSON string
    if (interests) {
      try {
        const parsedInterests = JSON.parse(interests)
        if (Array.isArray(parsedInterests)) {
          updateData.interests = parsedInterests
        }
      } catch (error) {
        console.error(error)
        return res
          .status(400)
          .json({ message: 'Invalid interests format. Must be a JSON array.' })
      }
    }

    // Check for unique username
    if (username) {
      const existingUser = await User.findOne({
        username,
        _id: { $ne: userId },
      })
      if (existingUser) {
        return res.status(400).json({ message: 'Username already taken' })
      }
    }

    // Check for unique uniqueId
    if (uniqueId) {
      const existingUserWithUniqueId = await User.findOne({
        uniqueId,
        _id: { $ne: userId },
      })
      if (existingUserWithUniqueId) {
        return res.status(400).json({ message: 'Unique ID already taken' })
      }
    }

    // Handle profile photo upload
    if (profilePhotoFile) {
      try {
        const uploadResult = await uploadImageToS3(
          profilePhotoFile.originalname,
          profilePhotoFile.mimetype,
          profilePhotoFile.buffer,
          'profile-photos'
        )
        if (uploadResult.success) {
          updateData.profile_photo = uploadResult.url
        } else {
          return res
            .status(500)
            .json({ message: 'Failed to upload profile photo' })
        }
      } catch (error) {
        console.error('Profile photo upload error:', error)
        return res
          .status(500)
          .json({ message: 'Error uploading profile photo' })
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select('-password')

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update the user's onboarding status
    if (
      !updatedUser.onboarding_completed &&
      updatedUser.interests &&
      updatedUser.interests.length > 0
    ) {
      updatedUser.onboarding_completed = true
      await updatedUser.save()
    }
    const redis = getRedisClient()
    if (redis) {
      await redis.del(`user_profile:${userId}`)
      await redis.del(`user_profile_public:${userId}`)
      console.log(`🗑️ Profile cache cleared for user: ${userId}`)
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser,
      onboarding_completed: updatedUser.onboarding_completed,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserCommunities = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { type = 'all' } = req.query

    let communities

    if (type === 'created') {
      communities = await Community.find({ founder: userId })
        .populate('followers', 'username profile_photo')
        .populate('creators', 'username profile_photo')
    } else if (type === 'joined') {
      const user = await User.findById(userId).populate({
        path: 'community',
        populate: {
          path: 'founder',
          select: 'username profile_photo',
        },
      })
      communities = user.community
    } else if (type === 'following') {
      const user = await User.findById(userId).populate({
        path: 'following_communities',
        populate: {
          path: 'founder',
          select: 'username profile_photo',
        },
      })
      communities = user.following_communities
    } else {
      const createdCommunities = await Community.find({ founder: userId })
        .populate('followers', 'username profile_photo')
        .populate('creators', 'username profile_photo')

      const user = await User.findById(userId)
        .populate({
          path: 'community',
          populate: {
            path: 'founder',
            select: 'username profile_photo',
          },
        })
        .populate({
          path: 'following_communities',
          populate: {
            path: 'founder',
            select: 'username profile_photo',
          },
        })

      communities = {
        created: createdCommunities,
        joined: user.community,
        following: user.following_communities,
      }
    }

    res.status(200).json({
      message: 'User communities retrieved successfully',
      communities,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserVideos = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { type = 'uploaded', page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    let videos

    if (type === 'saved') {
      const user = await User.findById(userId).populate({
        path: 'saved_videos',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.saved_videos
    } else if (type === 'liked') {
      const user = await User.findById(userId).populate({
        path: 'liked_videos',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.liked_videos
    } else if (type === 'history') {
      const user = await User.findById(userId).populate({
        path: 'history',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.history
    } else if (type === 'playlist') {
      const user = await User.findById(userId).populate({
        path: 'playlist',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.playlist
    } else {
      videos = await LongVideo.find({ created_by: userId })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
    }
    res.status(200).json({
      message: 'User videos retrieved successfully',
      videos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: videos && videos.length === parseInt(limit),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserInteractions = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { type = 'all' } = req.query

    let interactions = {}

    if (type === 'all' || type === 'likes') {
      const user = await User.findById(userId).populate({
        path: 'liked_videos',
        select: 'name thumbnailUrl creator views likes',
        populate: {
          path: 'creator',
          select: 'username profile_photo',
        },
      })
      interactions.liked_videos = user.liked_videos
    }

    if (type === 'all' || type === 'comments') {
      const commentedVideos = await LongVideo.find({
        'comments.user': userId,
      })
        .select('name thumbnailUrl creator comments')
        .populate('creator', 'username profile_photo')

      const userComments = commentedVideos.map((video) => ({
        video: {
          _id: video._id,
          name: video.name,
          thumbnailUrl: video.thumbnailUrl,
          creator: video.creator,
        },
        comments: video.comments.filter(
          (comment) => comment.user.toString() === userId.toString()
        ),
      }))

      interactions.comments = userComments
    }

    // get total

    res.status(200).json({
      message: 'User interactions retrieved successfully',
      interactions,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserEarnings = async (req, res, next) => {
  try {
    const userId = req.user._id

    const userVideos = await LongVideo.find({ creator: userId }).select(
      'name views likes shares'
    )

    const totalViews = userVideos.reduce((sum, video) => sum + video.views, 0)
    const totalLikes = userVideos.reduce((sum, video) => sum + video.likes, 0)
    const totalShares = userVideos.reduce((sum, video) => sum + video.shares, 0)

    const viewsEarnings = totalViews * 0.001
    const engagementBonus = (totalLikes + totalShares) * 0.01
    const totalEarnings = viewsEarnings + engagementBonus

    const earnings = {
      totalEarnings: parseFloat(totalEarnings.toFixed(2)),
      viewsEarnings: parseFloat(viewsEarnings.toFixed(2)),
      engagementBonus: parseFloat(engagementBonus.toFixed(2)),
      totalViews,
      totalLikes,
      totalShares,
      totalVideos: userVideos.length,
    }

    res.status(200).json({
      message: 'User earnings retrieved successfully',
      earnings,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}
/* 
types of notifications:
1:video:
 -reshare
 -like
 -comment
2:comment:
-like
-upvote
-donation
-reply
3:community:
-fee-payment
4:user
-follow
 */
const GetUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id.toString()
    const { page = 1, limit = 20 } = req.query

    const notifications = []

    const userLongVideos = await LongVideo.find({ creator: userId })
      .populate('comments.user', 'username profile_photo')
      .populate('liked_by', 'username profile_photo')
      .select('_id name comments liked_by')

    userLongVideos.forEach(async (video) => {
      const recentComments = video.comments.slice(-3).map((comment) => ({
        _id: comment._id,
        group: 'non-revenue',
        type: 'video comment',
        content: `${comment.user.username} commented on your video "${video.name}"`,
        videoId: video._id,
        avatar: comment.user.profile_photo,
        timeStamp: comment.createdAt,
        is_monetized: comment.is_monetized,
        read: false,
        URL: `/api/v1/videos/${video._id}`,
      }))

      notifications.push(...recentComments) //comment on user video -notification

      const recentLikes = video.liked_by.slice(-3).map((likedUser) => ({
        _id: likedUser._id,
        group: 'non-revenue',
        type: 'video like',
        content: `${likedUser.username} liked your video "${video.name}"`,
        videoId: video._id,
        avatar: likedUser.profile_photo,
        timeStamp: new Date(),
        read: false,
        URL: `/api/v1/videos/${video._id}`,
      }))

      notifications.push(...recentLikes) //like on user video -notification

      const userVideoReshares = await Reshare.find({ long_video: video._id })
        .sort({ createdAt: -1 })
        .limit(3)
        .populate('user', 'username profile_photo')
        .select('_id long_video user createdAt')

      const recentReshares = userVideoReshares.map((reshare) => ({
        _id: reshare._id,
        group: 'non-revenue',
        type: 'video reshare',
        content: `${reshare.user.username} reshared your video "${video.name}"`,
        videoId: video._id,
        avatar: reshare.user.profile_photo,
        timeStamp: reshare.createdAt,
        read: false,
        URL: `/api/v1/videos/${video._id}`,
      }))

      notifications.push(...recentReshares) //reshare user video -notification
    })

    const user = await User.findById(userId)
      .populate('followers', 'username profile_photo')
      .populate({
        path: 'my_communities',
        select: '_id name community_fee_type community_fee_amount followers',
        populate: {
          path: 'followers',
          select: '_id username profile_photo',
        },
      })
      .populate({
        path: 'commented_videos',
        select: '_id comments name',
        populate: {
          path: 'comments',
          select: '_id upvoted_by replies user liked_by donated_by',
          populate: [
            {
              path: 'upvoted_by',
              select: '_id username profile_photo',
            },
            {
              path: 'replies.user',
              select: '_id username profile_photo',
            },

            {
              path: 'liked_by',
              select: '_id username profile_photo',
            },
            {
              path: 'donated_by',
              select: '_id username profile_photo',
            },
          ],
        },
      })

    user.commented_videos.forEach((video) => {
      video.comments.forEach((comment) => {
        if (comment.user.toString() === userId) {
          const recentCommentUpvote = comment.upvoted_by
            .slice(-5)
            .map((upvotedUser) => ({
              _id: comment._id,
              group: 'non-revenue',
              type: 'comment upvote',
              content: `${upvotedUser.username} upvoted your comment on the video ${video.name}`,
              timeStamp: new Date(),
              avatar: upvotedUser.profile_photo,
              read: false,
              URL: `/api/v1/user/profile/${userId}`,
            }))

          notifications.push(...recentCommentUpvote) //user comment upvote -notification

          const recentCommentReplies = comment.replies
            .slice(-5)
            .map((reply) => ({
              _id: comment._id,
              group: 'non-revenue',
              type: 'comment reply',
              content: `${reply.user.username} replied to your comment on the video ${video.name}`,
              timeStamp: new Date(),
              avatar: reply.user.profile_photo,
              read: false,
              URL: `/api/v1/user/profile/${userId}`,
            }))
          notifications.push(...recentCommentReplies) //user comment replies -notification

          const recentCommentGift = comment.donated_by
            .slice(-5)
            .map((donatedUser) => ({
              _id: comment._id,
              group: 'revenue',
              type: 'comment gift',
              content: `${donatedUser.username} gifted to your comment on the video ${video.name}`,
              timeStamp: new Date(),
              avatar: donatedUser.profile_photo,
              read: false,
              URL: `/api/v1/user/profile/${userId}`,
            }))

          notifications.push(...recentCommentGift) //user comment gift -notification

          const recentCommentLikes = comment.liked_by
            .slice(-5)
            .map((likedUser) => ({
              _id: comment._id,
              group: 'non-revenue',
              type: 'comment like',
              content: `${likedUser.username} liked your comment on the video ${video.name}`,
              timeStamp: new Date(),
              avatar: likedUser.profile_photo,
              read: false,
              URL: `/api/v1/user/profile/${userId}`,
            }))

          notifications.push(...recentCommentLikes) //user comment like -notification
        }
      })
    })
    const recentFollowers = user.followers.slice(-5).map((follower) => ({
      _id: follower._id,
      group: 'non-revenue',
      type: 'follow',
      content: `${follower.username} started following you`,
      timeStamp: new Date(),
      avatar: follower.profile_photo,
      read: false,
      URL: `/api/v1/user/profile/${follower._id}`,
    }))

    notifications.push(...recentFollowers) //user follow -notification

    user.my_communities.forEach((community) => {
      if (community.community_fee_type === 'paid') {
        const recentCommunityFeePayers = community.followers
          .slice(-5)
          .map((follower) => ({
            _id: follower._id,
            group: 'revenue',
            content: `${follower.username} paid ₹${community.community_fee_amount} for community "${community.name}"`,
            type: 'community fee',
            timeStamp: new Date(),
            avatar: follower.profile_photo,
            read: false,
            URL: `/api/v1/community/${community._id}`,
          }))
        notifications.push(...recentCommunityFeePayers) //user community fee payment -notification
      }
    })

    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const startIndex = (page - 1) * limit
    const paginatedNotifications = notifications.slice(
      startIndex,
      startIndex + parseInt(limit)
    )

    res.status(200).json({
      message: 'User notifications retrieved successfully',
      notifications: paginatedNotifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: notifications.length > startIndex + parseInt(limit),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const UpdateUserInterests = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { interests, type } = req.body

    if (!Array.isArray(interests) || interests.length === 0) {
      return res
        .status(400)
        .json({ message: 'Interests must be a non-empty array' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (type === "interest1") {
      user.interest1 = interests
    } else if (type === "interest2") {
      user.interest2 = interests
    } else {
      user.interests = interests
    }

    await user.save()

    res.status(200).json({
      message: 'User interests updated successfully',
      user: {
        interests: user.interests,
        interest1: user.interest1,
        interest2: user.interest2,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}


const GetUserFollowers = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user._id
    const user = await User.findById(userId).populate(
      'followers',
      'username profile_photo followers'
    )
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    const enrichedUserFollowers = user.followers.map((follower) => ({
      _id: follower._id,
      username: follower.username,
      profile_photo: follower.profile_photo,
      total_followers: follower.followers?.length || 0,
      is_following: follower.followers?.includes(userId) || false, //determines whether the user also follows the follower or not (mutual following)
    }))

    res.status(200).json({
      message: 'User followers retrieved successfully',
      followers: enrichedUserFollowers,
      count: user.followers.length,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserFollowing = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user._id
    const user = await User.findById(userId).populate(
      'following',
      'username profile_photo'
    )
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.status(200).json({
      message: 'User following retrieved successfully',
      following: user.following,
      count: user.following.length,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserProfileDetails = async (req, res, next) => {
  try {
    const userId = req.user.id
    const redis = getRedisClient()
    const cacheKey = `user_profile:${userId}`

    if (redis) {
      const cachedProfile = await redis.get(cacheKey)
      if (cachedProfile) {
        console.log(`📦 Profile cache HIT for user: ${userId}`)
        return res.status(200).json({
          ...JSON.parse(cachedProfile),
          cached: true,
        })
      }
    }
    console.log(`🔄 Profile cache MISS for user: ${userId} - fetching fresh`)

    const userDetails = await User.findById(userId).select(
      'username profile_photo followers following my_communities interests onboarding_completed creator_profile social_media_links '
    )

    if (!userDetails) {
      return res.status(404).json({ message: 'User not found' })
    }

    const totalFollowers = userDetails.followers?.length || 0
    const totalFollowing = userDetails.following?.length || 0
    const totalCommunities = userDetails.my_communities?.length || 0

    const result = {
      message: 'User profile details retrieved successfully',
      user: {
        username: userDetails.username,
        profile_photo: userDetails.profile_photo,
        totalFollowers,
        totalFollowing,
        totalCommunities,
        onboarding_completed: userDetails.onboarding_completed || false,
        tags: userDetails.interests || [],
        creator_pass_price:
          userDetails.creator_profile?.creator_pass_price || 0,
        social_media_links: userDetails.social_media_links || {},
      },
      cached: false,
    }

    // Cache for 5 minutes
    if (redis) {
      await redis.setex(cacheKey, 300, JSON.stringify(result))
      console.log(`💾 Profile cached for user: ${userId}`)
    }

    res.status(200).json(result)
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserProfileById = async (req, res, next) => {
  try {
    const userId = req.params.id
    const redis = getRedisClient()
    const cacheKey = `user_profile_public:${userId}`
    const userid=req.user.id;

    if (redis) {
      const cachedProfile = await redis.get(cacheKey)
      if (cachedProfile) {
        console.log(`📦 Public profile cache HIT for user: ${userId}`)
        return res.status(200).json({
          ...JSON.parse(cachedProfile),
          cached: true,
        })
      }
    }
    const userDetails = await User.findById(userId).select(
      'username profile_photo followers following my_communities social_media_links'
    )

    if (!userDetails) {
      return res.status(404).json({ message: 'User not found' })
    }

    const totalFollowers = userDetails.followers?.length || 0
    const totalFollowing = userDetails.following?.length || 0
    const totalCommunities = userDetails.my_communities?.length || 0
    const isBeingFollowed= userDetails.followers?.includes(userid) || false;

    const result = {
      message: 'User profile details retrieved successfully',
      user: {
        username: userDetails.username,
        profile_photo: userDetails.profile_photo,
        totalFollowers,
        totalFollowing,
        totalCommunities,
        isBeingFollowed,
        social_media_links: userDetails.social_media_links || {},
      },
      cached: false,
    }

    // Cache for 3 minutes
    if (redis) {
      await redis.setex(cacheKey, 180, JSON.stringify(result))
    }

    res.status(200).json(result)
  } catch (error) {
    handleError(error, req, res, next)
  }
}
const GetUserVideosById = async (req, res, next) => {
  try {
    const userId = req.params.id
    const { type = 'uploaded', page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    let videos

    if (type === 'saved') {
      const user = await User.findById(userId).populate({
        path: 'saved_videos',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.saved_videos
    } else if (type === 'liked') {
      const user = await User.findById(userId).populate({
        path: 'liked_videos',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.liked_videos
    } else if (type === 'history') {
      const user = await User.findById(userId).populate({
        path: 'history',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.history
    } else if (type === 'playlist') {
      const user = await User.findById(userId).populate({
        path: 'playlist',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        options: {
          skip: skip,
          limit: parseInt(limit),
          sort: { createdAt: -1 },
        },
      })
      videos = user.playlist
    } else {
      videos = await LongVideo.find({ created_by: userId })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
    }

    res.status(200).json({
      message: 'User videos retrieved successfully',
      videos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: videos && videos.length === parseInt(limit),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const SetCreatorPassPrice = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { price } = req.body

    await User.findByIdAndUpdate(userId, {
      'creator_profile.creator_pass_price': price,
    })

    res.status(200).json({
      message: 'Creator pass price updated',
      price,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const HasCreatorPass = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { creatorId } = req.params

    const access = await UserAccess.findOne({
      user_id: userId,
      content_id: creatorId,
      content_type: 'creator',
      access_type: 'creator_pass',
    })

    res.status(200).json({ hasCreatorPass: !!access })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const followUser = async (req, res, next) => {
  try {
    const userId = req.user.id.toString() //convert to string to prevent type mismatch bugs
    const { followUserId } = req.body

    if (!followUserId) {
      return res.status(400).json({ message: 'Follow user ID is required' })
    }
    if (userId === followUserId) {
      return res.status(400).json({ message: 'You cannot follow yourself' })
    }

    const user = await User.findById(userId)
    const followUser = await User.findById(followUserId)

    if (!user || !followUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    const isAlreadyFollowing = user.following.some(
      (id) => id.toString() === followUserId
    )
    const isAlreadyFollowed = followUser.followers.some(
      (id) => id.toString() === userId
    )

    if (isAlreadyFollowing && isAlreadyFollowed) {
      return res
        .status(400)
        .json({ message: 'You are already following this user' })
    }

    // Add follow relationships
    if (!isAlreadyFollowing) user.following.push(followUserId)
    if (!isAlreadyFollowed) followUser.followers.push(userId)

    await user.save()
    await followUser.save()

    res.status(200).json({
      message: 'User followed successfully',
      isFollowing: true,
      user: {
        id: followUser._id,
        username: followUser.username,
        profile_photo: followUser.profile_photo,
        followers: followUser.followers.length,
        following: followUser.following.length,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const unfollowUser = async (req, res, next) => {
  try {
    const userId = req.user.id.toString() //convert to string to prevent type mismatch bugs
    const { unfollowUserId } = req.body
    if (!unfollowUserId) {
      return res.status(400).json({ message: 'Unfollow user ID is required' })
    }
    if (userId === unfollowUserId) {
      return res.status(400).json({ message: 'You cannot unfollow yourself' })
    }
    const user = await User.findById(userId)
    const unfollowUser = await User.findById(unfollowUserId)
    if (!user || !unfollowUser) {
      return res.status(404).json({ message: 'User not found' })
    }
    const isFollowing = user.following.some(
      (id) => id.toString() === unfollowUserId
    )
    const isFollowed = unfollowUser.followers.some(
      (id) => id.toString() === userId
    )
    if (!isFollowing || !isFollowed) {
      return res
        .status(400)
        .json({ message: 'You are not following this user' })
    }
    // Remove follow relationships
    user.following = user.following.filter(
      (id) => id.toString() !== unfollowUserId
    )
    unfollowUser.followers = unfollowUser.followers.filter(
      (id) => id.toString() !== userId
    )
    await user.save()
    await unfollowUser.save()
    res.status(200).json({
      message: 'User unfollowed successfully',
      isFollowing: false,
      user: {
        id: unfollowUser._id,
        username: unfollowUser.username,
        profile_photo: unfollowUser.profile_photo,
        followers: unfollowUser.followers.length,
        following: unfollowUser.following.length,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserHistory = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 10 } = req.query

    // Try Redis cache first
    const redis = getRedisClient()
    const cacheKey = `user_history:${userId}:${page}:${limit}`

    if (redis) {
      const cachedHistory = await redis.get(cacheKey)
      if (cachedHistory) {
        console.log(`📦 History cache HIT for user: ${userId}`)
        return res.status(200).json({
          ...JSON.parse(cachedHistory),
          cached: true,
        })
      }
    }

    console.log(`🔄 History cache MISS for user: ${userId} - fetching fresh`)

    const skip = (page - 1) * limit

    // First get user with viewed_videos (no populate yet)
    const user = await User.findById(userId).select('viewed_videos')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.viewed_videos || user.viewed_videos.length === 0) {
      return res.status(200).json({
        message: 'No viewing history found',
        videos: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore: false,
          totalVideos: 0,
        },
        cached: false,
      })
    }

    // Get the total count first
    const totalVideos = user.viewed_videos.length

    // Get paginated video IDs (most recent first)
    const paginatedVideoIds = user.viewed_videos
      .slice()
      .reverse() // Most recent first
      .slice(skip, skip + parseInt(limit))

    // Now populate the actual video details
    const viewedVideos = await LongVideo.find({
      _id: { $in: paginatedVideoIds },
    })
      .populate('created_by', 'username profile_photo')
      .select('_id name thumbnailUrl description views likes createdAt')

    const orderedVideos = paginatedVideoIds
      .map((videoId) =>
        viewedVideos.find(
          (video) => video._id.toString() === videoId.toString()
        )
      )
      .filter(Boolean) // Remove any null/undefined entries

    // Format the response
    const formattedVideos = orderedVideos.map((video) => ({
      _id: video._id,
      name: video.name,
      thumbnailUrl: video.thumbnailUrl,
      description: video.description,
      views: video.views,
      likes: video.likes,
      created_by: {
        _id: video.created_by._id,
        username: video.created_by.username,
        profile_photo: video.created_by.profile_photo,
      },
      createdAt: video.createdAt,
    }))

    const result = {
      message: 'User history retrieved successfully',
      videos: formattedVideos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: skip + parseInt(limit) < totalVideos,
        totalVideos,
        totalPages: Math.ceil(totalVideos / parseInt(limit)),
      },
      cached: false,
    }

    // Cache for 2 minutes (history changes frequently)
    if (redis && formattedVideos.length > 0) {
      await redis.setex(cacheKey, 120, JSON.stringify(result))
      console.log(`💾 History cached for user: ${userId}`)
    }

    res.status(200).json(result)
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserLikedVideosInCommunity = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { communityId, page = 1, limit = 10 } = req.query

    // Validate required parameters
    if (!communityId) {
      return res.status(400).json({ message: 'Community ID is required' })
    }

    const skip = (page - 1) * limit
    const redis = getRedisClient()
    const cacheKey = `user_liked_videos_community:${userId}:${communityId}:${page}:${limit}`

    // Try Redis cache first
    if (redis) {
      const cachedVideos = await redis.get(cacheKey)
      if (cachedVideos) {
        console.log(
          `📦 Liked videos cache HIT for user: ${userId} in community: ${communityId}`
        )
        return res.status(200).json({
          ...JSON.parse(cachedVideos),
          cached: true,
        })
      }
    }

    console.log(
      `🔄 Liked videos cache MISS for user: ${userId} in community: ${communityId} - fetching fresh`
    )

    // Get user with populated liked_videos
    const user = await User.findById(userId).populate({
      path: 'liked_videos',
      select:
        '_id name thumbnailUrl description views likes createdAt community created_by',
      populate: [
        {
          path: 'created_by',
          select: '_id username profile_photo',
        },
        {
          path: 'community',
          select: '_id name profile_photo',
        },
      ],
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Filter videos by community
    const likedVideos = user.liked_videos.filter(
      (video) =>
        video.community && video.community._id.toString() === communityId
    )

    if (likedVideos.length === 0) {
      return res.status(200).json({
        message: 'No liked videos found in this community',
        videos: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore: false,
          totalVideos: 0,
        },
        cached: false,
      })
    }

    // Apply pagination
    const totalVideos = likedVideos.length
    const paginatedVideos = likedVideos.slice(skip, skip + parseInt(limit))

    // Format the response
    const formattedVideos = paginatedVideos.map((video) => ({
      _id: video._id,
      name: video.name,
      thumbnailUrl: video.thumbnailUrl,
      description: video.description,
      views: video.views,
      likes: video.likes,
      created_by: {
        _id: video.created_by._id,
        username: video.created_by.username,
        profile_photo: video.created_by.profile_photo,
      },
      createdAt: video.createdAt,
      community: {
        _id: video.community._id,
        name: video.community.name,
        profile_photo: video.community.profile_photo,
      },
    }))

    const result = {
      message: 'User liked videos in community retrieved successfully',
      videos: formattedVideos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: skip + parseInt(limit) < totalVideos,
        totalVideos,
        totalPages: Math.ceil(totalVideos / parseInt(limit)),
      },
      cached: false,
    }

    // Cache for 2 minutes
    if (redis && formattedVideos.length > 0) {
      await redis.setex(cacheKey, 120, JSON.stringify(result))
      console.log(
        `💾 Liked videos cached for user: ${userId} in community: ${communityId}`
      )
    }

    res.status(200).json(result)
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const updateSocialMediaLinks = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { facebook, twitter, instagram, youtube, snapchat } = req.body

    // Validate URLs if provided
    const urlPattern =
      /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/

    const socialMediaData = {}

    if (facebook !== undefined) {
      if (facebook && !urlPattern.test(facebook)) {
        return res.status(400).json({ message: 'Invalid Facebook URL format' })
      }
      socialMediaData['social_media_links.facebook'] = facebook
    }

    if (twitter !== undefined) {
      if (twitter && !urlPattern.test(twitter)) {
        return res.status(400).json({ message: 'Invalid Twitter URL format' })
      }
      socialMediaData['social_media_links.twitter'] = twitter
    }

    if (instagram !== undefined) {
      if (instagram && !urlPattern.test(instagram)) {
        return res.status(400).json({ message: 'Invalid Instagram URL format' })
      }
      socialMediaData['social_media_links.instagram'] = instagram
    }

    if (youtube !== undefined) {
      if (youtube && !urlPattern.test(youtube)) {
        return res.status(400).json({ message: 'Invalid YouTube URL format' })
      }
      socialMediaData['social_media_links.youtube'] = youtube
    }

    if (snapchat !== undefined) {
      if (snapchat && !urlPattern.test(snapchat)) {
        return res.status(400).json({ message: 'Invalid Snapchat URL format' })
      }
      socialMediaData['social_media_links.snapchat'] = snapchat
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: socialMediaData },
      { new: true, runValidators: true }
    ).select('social_media_links username')

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Clear cache if Redis is available
    const redis = getRedisClient()
    if (redis) {
      await redis.del(`user_profile:${userId}`)
      await redis.del(`user_profile_public:${userId}`)
      console.log(`🗑️ Profile cache cleared for user: ${userId}`)
    }

    res.status(200).json({
      message: 'Social media links updated successfully',
      social_media_links: updatedUser.social_media_links,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserDashboardAnalytics = async (req, res, next) => {
  const userId = req.user._id.toString()
  const group = req.query.group
    ? Array.isArray(req.query.group)
      ? req.query.group
      : [req.query.group]
    : null
  const response = {}

  try {
    //both created and joined communities
    if (!group || group.includes('communities')) {
      const userComunities = {}
      const createdCommunities = await Community.find({ founder: userId })
        .populate('followers', 'username profile_photo')
        .populate('creators', 'username profile_photo')

      const user = await User.findById(userId).populate({
        path: 'community',
        populate: {
          path: 'founder',
          select: 'username profile_photo',
        },
      })
      const joinedCommunities = user.community
      userComunities.created = createdCommunities
      userComunities.joined = joinedCommunities
      response.communities = userComunities
    }
    //videos created by the user
    if (!group || group.includes('videos')) {
      const page = 1,
        limit = 10
      const skip = (page - 1) * limit
      const videos = await LongVideo.find({ created_by: userId })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
      const totalVideos = await LongVideo.countDocuments({ created_by: userId })
      const result = {
        videos,
        pagination: {
          page: page,
          limit: limit,
          hasMore: skip + limit < totalVideos,
          totalVideos,
          totalPages: Math.ceil(totalVideos / limit),
        },
      }
      response.videos = result
    }
    //user followers
    if (!group || group.includes('followers')) {
      const user = await User.findById(userId).populate(
        'followers',
        'username profile_photo followers'
      )
      const enrichedUserFollowers = user.followers.map((follower) => ({
        _id: follower._id,
        username: follower.username,
        profile_photo: follower.profile_photo,
        total_followers: follower.followers?.length || 0,
        is_following: follower.followers?.includes(userId) || false, //determines whether the user also follows the follower or not (mutual following)
      }))
      response.followers = {
        data: enrichedUserFollowers,
        count: user.followers.length,
      }
    }
    //user following
    if (!group || group.includes('following')) {
      const user = await User.findById(userId).populate(
        'following',
        'username profile_photo'
      )

      response.following = {
        data: user.following,
        count: user.following.length,
      }
    }

    //video likes, comment upvotes, video reshares, comments and replies
    if (!group || group.includes('interactions')) {
      const interactions = {}
      //video likes
      const user = await User.findById(userId).populate({
        path: 'liked_videos',
        select: 'name thumbnailUrl creator views likes',
        populate: {
          path: 'creator',
          select: 'username profile_photo',
        },
      })
      interactions.liked_videos = user.liked_videos
      //reshares
      const reshares = await Reshare.find({ user: userId }).populate({
        path: 'long_video',
        select: 'name description videoUrl thumbnailUrl created_by',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
      })
      interactions.reshares = reshares
      //comments
      const comments = await Comment.find({ user: userId })
        .populate({
          path: 'long_video',
          select: 'name description videoUrl thumbnailUrl created_by',
          populate: {
            path: 'created_by',
            select: 'username profile_photo',
          },
        })
        .populate({
          path: 'parent_comment',
          select: 'content user',
          populate: {
            path: 'user',
            select: 'username profile_photo',
          },
        })
      interactions.comments = comments

      //comment upvotes
      const upvotedComments = await Comment.find({ upvoted_by: userId })
        .populate({
          path: 'user',
          select: 'username profile_photo',
        })
        .populate({
          path: 'long_video',
          select: 'name',
        })
        .populate({
          path: 'parent_comment',
          select: 'content user',
          populate: {
            path: 'user',
            select: 'username profile_photo',
          },
        })
      interactions.upvoted_comments = upvotedComments

      response.interactions = interactions
    }
    if (!group || group.includes('watch_time')) {
      const user = await User.findById(userId).select('watch_time')
      response.watch_time = user.watch_time
    }
    //user earnings
    if (!group || group.includes('earnings')) {
      const user = await User.findById(userId)
      const earnings = {}
      earnings.creator_pass = user.creator_profile?.total_earned || 0
      earnings.advertisement_earnings = user.advertisement_earnings
      let communityEarnings = 0
      const userCommunities = await Community.find({ founder: userId }).select(
        'total_fee_collected'
      )
      userCommunities.forEach((community) => {
        communityEarnings += community.total_fee_collected
      })
      earnings.community_fee_earnings = communityEarnings
      let giftingEarnings = 0
      let videoPurchaseEarnings = 0
      let seriesPurchaseEarnings = 0
      const userComments = await Comment.find({ user: userId }).select('gifts')
      const userVideos = await LongVideo.find({ created_by: userId }).select(
        'gifts earned_till_date'
      )
      const userSeries = await Series.find({
        created_by: userId,
      }).select('total_earned')
      userSeries.forEach((series) => {
        seriesPurchaseEarnings += series.total_earned
      })
      userComments.forEach((comment) => {
        giftingEarnings += comment.gifts
      })
      earnings.comment_gifting_earnings = giftingEarnings
      giftingEarnings = 0
      userVideos.forEach((video) => {
        giftingEarnings += video.gifts
        videoPurchaseEarnings += video.earned_till_date
      })
      earnings.video_gifting_earnings = giftingEarnings
      earnings.video_purchase_earnings = videoPurchaseEarnings
      earnings.series_purchase_earnings = seriesPurchaseEarnings
      response.earnings = earnings
    }
    //user history
    if (!group || group.includes('history')) {
      const page = 1,
        limit = 10
      let history
      // Try Redis cache first
      const redis = getRedisClient()
      const cacheKey = `user_history:${userId}:${page}:${limit}`
      const cachedHistory = await redis?.get(cacheKey)
      if (redis && cachedHistory) {
        console.log(`📦 History cache HIT for user: ${userId}`)
        history = JSON.parse(cachedHistory)
      } else {
        const skip = (page - 1) * limit

        // First get user with viewed_videos (no populate yet)
        const user = await User.findById(userId).select('viewed_videos')

        if (!user.viewed_videos || user.viewed_videos.length === 0) {
          history = []
        } else {
          // Get the total count first
          const totalVideos = user.viewed_videos.length

          // Get paginated video IDs (most recent first)
          const paginatedVideoIds = user.viewed_videos
            .slice()
            .reverse() // Most recent first
            .slice(skip, skip + parseInt(limit))

          // Now populate the actual video details
          const viewedVideos = await LongVideo.find({
            _id: { $in: paginatedVideoIds },
          })
            .populate('created_by', 'username profile_photo')
            .select('_id name thumbnailUrl description views likes createdAt')

          const orderedVideos = paginatedVideoIds
            .map((videoId) =>
              viewedVideos.find(
                (video) => video._id.toString() === videoId.toString()
              )
            )
            .filter(Boolean) // Remove any null/undefined entries

          // Format the response
          const formattedVideos = orderedVideos.map((video) => ({
            _id: video._id,
            name: video.name,
            thumbnailUrl: video.thumbnailUrl,
            description: video.description,
            views: video.views,
            likes: video.likes,
            created_by: {
              _id: video.created_by._id,
              username: video.created_by.username,
              profile_photo: video.created_by.profile_photo,
            },
            createdAt: video.createdAt,
          }))

          history = {
            videos: formattedVideos,
            pagination: {
              page: page,
              limit: limit,
              hasMore: skip + limit < totalVideos,
              totalVideos,
              totalPages: Math.ceil(totalVideos / limit),
            },
          }

          // Cache for 2 minutes (history changes frequently)
          if (redis && formattedVideos.length > 0) {
            await redis.setex(cacheKey, 120, JSON.stringify(history))
            console.log(`💾 History cached for user: ${userId}`)
          }
        }
      }
      response.history = history
    }

    res.status(200).json({
      message: 'Dashboard data retrieved successfully',
      data: response,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserPurchasedAccess = async (req, res, next) => {
  try {
    const userId = req.user._id.toString()
    const response = {}

    const individualPurchases = await UserAccess.find({
      user_id: userId,
      content_type: { $in: ['video', 'series'] },
    })

    const enrichedIndividualPurchases = await Promise.all(
      individualPurchases.map(async (purchase) => {
        let asset_data
        if (purchase.content_type === 'video') {
          asset_data = await LongVideo.findById(purchase.content_id)
            .select('name description thumbnailUrl _id created_by')
            .populate({
              path: 'created_by',
              select: 'username profile_photo _id',
            })
        } else {
          asset_data = await Series.findById(purchase.content_id)
            .select(
              'title description total_episodes bannerUrl posterUrl _id created_by episodes'
            )
            .populate({
              path: 'created_by',
              select: 'username profile_photo _id',
            })
            .populate({
              path: 'episodes',
              select: 'name description _id thumbnailUrl',
            })
        }

        return {
          ...purchase.toObject(),
          asset_data,
        }
      })
    )

    const creatorPassesPurchased = await CreatorPass.find({
      user_id: userId,
    }).populate('creator_id', 'username profile_photo')

    response.assets = enrichedIndividualPurchases
    response.creator_passes = creatorPassesPurchased

    res.status(200).json({
      message: 'User purchased access data retrieved successfully',
      data: response,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const toggleCommentMonetization = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()

    const currentUser = await User.findById(userId).select(
      'comment_monetization_enabled'
    )
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    const newStatus = !currentUser.comment_monetization_enabled

    // Atomic update to avoid race conditions
    await User.findByIdAndUpdate(
      userId,
      { $set: { comment_monetization_enabled: newStatus } },
      { new: true }
    )

    return res.status(200).json({
      message: `User comment monetization ${newStatus ? 'enabled' : 'disabled'} successfully`,
    })
  } catch (error) {
    return handleError(error, req, res, next)
  }
}

const saveUserFCMToken = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { fcm_token } = req.body
    if (!userId || !fcm_token) {
      return res
        .status(400)
        .json({ message: 'userId and fcm_token are required' })
    }
    const user = await User.findById(userId).select('FCM_token')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    user.FCM_token = fcm_token
    await user.save()
    return res.status(200).json({
      message: 'User FCM token saved successfully',
    })
  } catch (error) {
    return handleError(error, req, res, next)
  }
}

const GetStatusOfReshare=async(req,res,next)=>{
  try {
    const userId=req.user.id
    const { videoId } = req.body
    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' })
    }
    const reshare= await Reshare.findOne({
      user: userId,
      long_video: videoId,
    })
    if (!reshare) {
      return res.status(404).json({ message: 'Reshare not found' })
    }
    const response={};
    response.reshareStatus = reshare? true : false;
    return res.status(200).json({
      message: 'Reshare status retrieved successfully',
      data: response,
    })
    
  } catch (error) {
   handleError(error, req, res, next)
    
  }
}

const AddVideoToUserViewHistory=async(req,res,next)=>{
  try {
    const userId=req.user.id
    const { videoId } = req.body
    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' })
    }
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    // Check if video is already in history
    if (user.viewed_videos.includes(videoId)) {
      return res.status(200).json({ message: 'Video already in history' })
    }
    // Add video to viewed_videos
    user.viewed_videos.push(videoId)
    await user.save()
    return res.status(200).json({
      message: 'Video added to user view history successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {

  getUserProfileDetails,
  GetUserFeed,
  GetUserProfile,
  UpdateUserProfile,
  UpdateUserInterests,
  GetUserCommunities,
  GetUserVideos,
  GetUserInteractions,
  GetUserEarnings,
  GetUserNotifications,
  GetUserFollowers,
  GetUserFollowing,
  GetUserVideosById,
  GetUserProfileById,
  SetCreatorPassPrice,
  HasCreatorPass,
  followUser,
  unfollowUser,
  getUserHistory,
  getUserLikedVideosInCommunity,
  updateSocialMediaLinks,
  getUserDashboardAnalytics,
  getUserPurchasedAccess,
  toggleCommentMonetization,
  saveUserFCMToken,
  GetStatusOfReshare,
  AddVideoToUserViewHistory,
}
