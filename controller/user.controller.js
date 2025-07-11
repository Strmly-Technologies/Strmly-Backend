const User = require('../models/User')
const Community = require('../models/Community')
const LongVideo = require('../models/LongVideo')
const ShortVideo = require('../models/ShortVideos')
const WalletTransfer = require('../models/WalletTransfer')
const CreatorPass = require('../models/CreatorPass')
const { handleError } = require('../utils/utils')

const GetUserFeed = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    const user = await User.findById(userId)
      .populate('following', '_id')
      .populate('community', '_id')

    const followingIds = user.following.map((f) => f._id)
    const communityIds = user.community.map((c) => c._id)

    const feedVideos = await LongVideo.find({
      $or: [
        { created_by: { $in: followingIds } },
        { community: { $in: communityIds } },
      ],
    })
      .populate('created_by', 'username profile_photo')
      .populate('community', 'name profile_photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    res.status(200).json({
      message: 'User feed retrieved successfully',
      feed: feedVideos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feedVideos.length === parseInt(limit),
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
      onboarding_completed: user.onboarding_completed
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const UpdateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { username, bio, profile_photo, date_of_birth } = req.body

    const updateData = {}
    if (username) updateData.username = username
    if (bio !== undefined) updateData.bio = bio
    if (profile_photo !== undefined) updateData.profile_photo = profile_photo
    if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth

    if (username) {
      const existingUser = await User.findOne({
        username,
        _id: { $ne: userId },
      })
      if (existingUser) {
        return res.status(400).json({ message: 'Username already taken' })
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
    if (!updatedUser.onboarding_completed && updatedUser.interests.length > 0) {
      updatedUser.onboarding_completed = true
      await updatedUser.save()
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
    const userId = req.user._id
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
    } else {
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

      communities = {
        created: createdCommunities,
        joined: user.community,
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
    const userId = req.user._id
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
    } else if(type==='long'){
      videos = await LongVideo.find({ created_by: userId })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
    }
    else {
      videos= await ShortVideo.find({ created_by: userId })
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

    const shortVideos = await ShortVideo.find({ created_by: userId }).select(
      'name views likes shares'
    )
    userVideos.push(...shortVideos)
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

const GetUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { page = 1, limit = 20, type = 'all' } = req.query

    const notifications = []

    // 1. Follow notifications
    if (type === 'all' || type === 'follows') {
      const user = await User.findById(userId)
        .populate('followers', 'username profile_photo')
      
      const recentFollowers = user.followers.slice(-10).map((follower) => ({
        type: 'follow',
        message: `${follower.username} started following you`,
        user: follower,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random within last week
        priority: 2,
      }))
      notifications.push(...recentFollowers)
    }

    // 2. Comment notifications (Long Videos)
    if (type === 'all' || type === 'comments') {
      const userLongVideos = await LongVideo.find({ created_by: userId })
        .populate('comments.user', 'username profile_photo')
        .select('name comments createdAt')
        .sort({ 'comments.createdAt': -1 })
        .limit(20)

      userLongVideos.forEach((video) => {
        const recentComments = video.comments.slice(-5).map((comment) => ({
          type: 'comment',
          message: `${comment.user.username} commented on your video "${video.name}"`,
          user: comment.user,
          video: { _id: video._id, name: video.name, type: 'long' },
          createdAt: comment.createdAt,
          priority: 3,
        }))
        notifications.push(...recentComments)
      })
    }

    // 3. Comment notifications (Short Videos)
    if (type === 'all' || type === 'comments') {
      const userShortVideos = await ShortVideo.find({ created_by: userId })
        .populate('comments.user', 'username profile_photo')
        .select('name comments createdAt')
        .sort({ 'comments.createdAt': -1 })
        .limit(20)

      userShortVideos.forEach((video) => {
        const recentComments = video.comments.slice(-5).map((comment) => ({
          type: 'comment',
          message: `${comment.user.username} commented on your short video "${video.name}"`,
          user: comment.user,
          video: { _id: video._id, name: video.name, type: 'short' },
          createdAt: comment.createdAt,
          priority: 3,
        }))
        notifications.push(...recentComments)
      })
    }

    // 4. Gift notifications (received)
    if (type === 'all' || type === 'gifts') {
      const WalletTransfer = require('../models/WalletTransfer')
      const receivedGifts = await WalletTransfer.find({
        receiver_id: userId,
        transfer_type: { $in: ['comment_gift', 'short_video_gift'] },
        status: 'completed'
      })
        .populate('sender_id', 'username profile_photo')
        .populate('content_id', 'name title')
        .sort({ createdAt: -1 })
        .limit(15)

      const giftNotifications = receivedGifts.map((gift) => ({
        type: 'gift_received',
        message: `${gift.sender_id.username} sent you ₹${gift.total_amount} as a gift`,
        user: gift.sender_id,
        amount: gift.total_amount,
        giftType: gift.transfer_type,
        content: {
          _id: gift.content_id?._id,
          name: gift.content_id?.name || gift.content_id?.title,
          type: gift.transfer_type === 'comment_gift' ? 'comment' : 'video'
        },
        giftNote: gift.metadata?.transfer_note || '',
        createdAt: gift.createdAt,
        priority: 1, // High priority for money received
      }))
      notifications.push(...giftNotifications)
    }

    // 5. Community fee notifications (for community founders)
    if (type === 'all' || type === 'community') {
      const WalletTransfer = require('../models/WalletTransfer')
      const Community = require('../models/Community')
      
      // Get communities founded by this user
      const userCommunities = await Community.find({ founder: userId }).select('_id')
      const communityIds = userCommunities.map(c => c._id)
      
      const communityFees = await WalletTransfer.find({
        receiver_id: userId,
        transfer_type: 'community_fee',
        content_id: { $in: communityIds },
        status: 'completed'
      })
        .populate('sender_id', 'username profile_photo')
        .populate('content_id', 'name')
        .sort({ createdAt: -1 })
        .limit(10)

      const communityNotifications = communityFees.map((fee) => ({
        type: 'community_fee',
        message: `${fee.sender_id.username} paid ₹${fee.total_amount} to upload in your community "${fee.content_id.name}"`,
        user: fee.sender_id,
        amount: fee.creator_amount,
        community: {
          _id: fee.content_id._id,
          name: fee.content_id.name
        },
        createdAt: fee.createdAt,
        priority: 1,
      }))
      notifications.push(...communityNotifications)
    }

    // 6. Creator Pass notifications (sales)
    if (type === 'all' || type === 'creator_pass') {
      const CreatorPass = require('../models/CreatorPass')
      const soldPasses = await CreatorPass.find({
        creator_id: userId,
        status: 'active'
      })
        .populate('user_id', 'username profile_photo')
        .sort({ createdAt: -1 })
        .limit(10)

      const passNotifications = soldPasses.map((pass) => ({
        type: 'creator_pass_sold',
        message: `${pass.user_id.username} purchased your Creator Pass for ₹${pass.amount_paid}`,
        user: pass.user_id,
        amount: pass.amount_paid,
        duration: '30 days',
        createdAt: pass.createdAt,
        priority: 1,
      }))
      notifications.push(...passNotifications)
    }

    // 7. Series purchase notifications
    if (type === 'all' || type === 'purchases') {
      const WalletTransfer = require('../models/WalletTransfer')
      const seriesPurchases = await WalletTransfer.find({
        receiver_id: userId,
        transfer_type: 'series_purchase',
        status: 'completed'
      })
        .populate('sender_id', 'username profile_photo')
        .populate('content_id', 'title')
        .sort({ createdAt: -1 })
        .limit(10)

      const purchaseNotifications = seriesPurchases.map((purchase) => ({
        type: 'series_purchase',
        message: `${purchase.sender_id.username} purchased your series "${purchase.content_id.title}" for ₹${purchase.total_amount}`,
        user: purchase.sender_id,
        amount: purchase.creator_amount,
        totalAmount: purchase.total_amount,
        series: {
          _id: purchase.content_id._id,
          title: purchase.content_id.title
        },
        createdAt: purchase.createdAt,
        priority: 1,
      }))
      notifications.push(...purchaseNotifications)
    }

    // 8. Creator Pass purchase confirmations (for buyers)
    if (type === 'all' || type === 'my_purchases') {
      const CreatorPass = require('../models/CreatorPass')
      const myPasses = await CreatorPass.find({
        user_id: userId,
        status: 'active'
      })
        .populate('creator_id', 'username profile_photo')
        .sort({ createdAt: -1 })
        .limit(5)

      const myPassNotifications = myPasses.map((pass) => ({
        type: 'creator_pass_purchased',
        message: `Your Creator Pass for ${pass.creator_id.username} is now active`,
        user: pass.creator_id,
        amount: pass.amount_paid,
        expiresAt: pass.end_date,
        createdAt: pass.createdAt,
        priority: 2,
      }))
      notifications.push(...myPassNotifications)
    }

    // Sort notifications by priority and date
    notifications.sort((a, b) => {
      // First sort by priority (lower number = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }
      // Then sort by date (newer first)
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

    // Pagination
    const startIndex = (page - 1) * limit
    const paginatedNotifications = notifications.slice(
      startIndex,
      startIndex + parseInt(limit)
    )

    // Count by type for summary
    const notificationSummary = {
      total: notifications.length,
      unread: notifications.length, // You can implement read/unread status later
      byType: {
        follows: notifications.filter(n => n.type === 'follow').length,
        comments: notifications.filter(n => n.type === 'comment').length,
        gifts: notifications.filter(n => n.type === 'gift_received').length,
        community: notifications.filter(n => n.type === 'community_fee').length,
        creatorPass: notifications.filter(n => n.type.includes('creator_pass')).length,
        purchases: notifications.filter(n => n.type === 'series_purchase').length,
      }
    }

    res.status(200).json({
      message: 'User notifications retrieved successfully',
      notifications: paginatedNotifications,
      summary: notificationSummary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: notifications.length > startIndex + parseInt(limit),
        totalPages: Math.ceil(notifications.length / parseInt(limit)),
        total: notifications.length,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}



const UpdateUserInterests = async (req, res, next) => {
  try {
    const userId = req.user._id
    const { interests } = req.body

    if (!Array.isArray(interests) || interests.length === 0) {
      return res
        .status(400)
        .json({ message: 'Interests must be a non-empty array' })
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { interests },
      { new: true, runValidators: true }
    ).select('-password')

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.status(200).json({
      message: 'User interests updated successfully',
      user: updatedUser,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserFollowers = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user._id
    const user = await User.findById(userId).populate('followers', 'username profile_photo')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.status(200).json({
      message: 'User followers retrieved successfully',
      followers: user.followers,
      count: user.followers.length,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GetUserFollowing = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user._id
    const user = await User.findById(userId).populate('following', 'username profile_photo')
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
    const userId = req.user.id;

    const userDetails = await User.findById(userId)
      .select('username profile_photo followers following my_communities');

    if (!userDetails) {
      return res.status(404).json({ message: 'User not found' });
    }

    const totalFollowers = userDetails.followers?.length || 0;
    const totalFollowing = userDetails.following?.length || 0;
    const totalCommunities = userDetails.my_communities?.length || 0;

    res.status(200).json({
      message: 'User profile details retrieved successfully',
      user: {
        username: userDetails.username,
        profile_photo: userDetails.profile_photo,
        totalFollowers,
        totalFollowing,
        totalCommunities,
        onboarding_completed: userDetails.onboarding_completed,
        tags: userDetails.interests || [],
        creator_pass_price: userDetails.creator_profile?.creator_pass_price || 0
      }
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const GetUserProfileById=async(req,res,next)=>{
  try {
    const userId = req.params.id;
    const userDetails = await User.findById(userId)
      .select('username profile_photo followers following my_communities');

    if (!userDetails) {
      return res.status(404).json({ message: 'User not found' });
    }

    const totalFollowers = userDetails.followers?.length || 0;
    const totalFollowing = userDetails.following?.length || 0;
    const totalCommunities = userDetails.my_communities?.length || 0;

    res.status(200).json({
      message: 'User profile details retrieved successfully',
      user: {
        username: userDetails.username,
        profile_photo: userDetails.profile_photo,
        totalFollowers,
        totalFollowing,
        totalCommunities,
      }
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};
const GetUserVideosById=async(req,res,next)=>{
   try {
    const userId = req.params.id;
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
    const userId = req.user.id;
    const { price } = req.body;
    
    if (typeof price !== 'number' || price < 99 || price > 10000) {
      return res.status(400).json({ 
        message: 'Invalid price. Must be between ₹99 and ₹10000' 
      });
    }
    
    await User.findByIdAndUpdate(userId, {
      'creator_profile.creator_pass_price': price,
    });
    
    res.status(200).json({ 
      message: 'Creator pass price updated', 
      price 
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const HasCreatorPass = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { creatorId } = req.params;
    
    const access = await UserAccess.findOne({
      user_id: userId,
      content_id: creatorId,
      content_type: 'creator',
      access_type: 'creator_pass',
    });
    
    res.status(200).json({ hasCreatorPass: !!access });
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const followUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { followUserId } = req.body;

    if (!followUserId) {
      return res.status(400).json({ message: 'Follow user ID is required' });
    }

    if (userId === followUserId) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const user = await User.findById(userId);
    const followUser = await User.findById(followUserId);

    if (!user || !followUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isAlreadyFollowing = user.following.some(
      (id) => id.toString() === followUserId
    );
    const isAlreadyFollowed = followUser.followers.some(
      (id) => id.toString() === userId
    );

    if (isAlreadyFollowing && isAlreadyFollowed) {
      return res
        .status(400)
        .json({ message: 'You are already following this user' });
    }

    // Add follow relationships
    if (!isAlreadyFollowing) user.following.push(followUserId);
    if (!isAlreadyFollowed) followUser.followers.push(userId);

    await user.save();
    await followUser.save();

    res.status(200).json({
      message: 'User followed successfully',
      user: {
        id: followUser._id,
        username: followUser.username,
        profile_photo: followUser.profile_photo,
        followers: followUser.followers.length,
        following: followUser.following.length,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const unfollowUser=async(req,res,next)=>{
  try {
    const userId = req.user.id;
    const { unfollowUserId } = req.body;
    if (!unfollowUserId) {
      return res.status(400).json({ message: 'Unfollow user ID is required' });
    }
    if (userId === unfollowUserId) {
      return res.status(400).json({ message: 'You cannot unfollow yourself' });
    }
    const user = await User.findById(userId);
    const unfollowUser = await User.findById(unfollowUserId);
    if (!user || !unfollowUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isFollowing = user.following.some(
      (id) => id.toString() === unfollowUserId
    );
    const isFollowed = unfollowUser.followers.some(
      (id) => id.toString() === userId
    );
    if (!isFollowing || !isFollowed) {
      return res.status(400).json({ message: 'You are not following this user' });
    }
    // Remove follow relationships
    user.following = user.following.filter(
      (id) => id.toString() !== unfollowUserId
    );
    unfollowUser.followers = unfollowUser.followers.filter(
      (id) => id.toString() !== userId
    );
    await user.save();
    await unfollowUser.save();
    res.status(200).json({
      message: 'User unfollowed successfully',
      user: {
        id: unfollowUser._id,
        username: unfollowUser.username,
        profile_photo: unfollowUser.profile_photo,
        followers: unfollowUser.followers.length,
        following: unfollowUser.following.length,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
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
}
