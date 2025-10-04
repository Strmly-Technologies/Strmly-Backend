const LongVideo = require('../models/LongVideo')
const Comment = require('../models/Comment')
const Wallet = require('../models/Wallet')
const WalletTransaction = require('../models/WalletTransaction')
const WalletTransfer = require('../models/WalletTransfer')
const User = require('../models/User')
const Series = require('../models/Series')
const mongoose = require('mongoose')
const Reshare = require('../models/Reshare')
const { handleError } = require('../utils/utils')
const {
  addVideoLikeNotificationToQueue,
  addVideoCommentNotificationToQueue,
  addCommentUpvoteNotificationToQueue,
  addCommentGiftNotificationToQueue,
  addVideoReshareNotificationToQueue,
  addCommentReplyNotificationToQueue,
} = require('../utils/notification_queue')

const MIN_GIFT_AMOUNT = 1
const MAX_GIFT_AMOUNT = 1000

const validateAmount = (
  amount,
  min = MIN_GIFT_AMOUNT,
  max = MAX_GIFT_AMOUNT
) => {
  if (!amount || typeof amount !== 'number') {
    return {
      isValid: false,
      error: 'Amount is required and must be a number',
    }
  }
  if (amount < min) {
    return { isValid: false, error: `Minimum gift amount is ₹${min}` }
  }
  if (amount > max) {
    return { isValid: false, error: `Maximum gift amount is ₹${max}` }
  }
  if (amount !== Math.floor(amount)) {
    return { isValid: false, error: 'Amount must be a whole number' }
  }
  return { isValid: true }
}

const validateObjectId = (id, fieldName = 'ID') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { isValid: false, error: `Invalid ${fieldName}` }
  }
  return { isValid: true }
}

/* const getOrCreateWallet = async (userId, walletType = 'user') => {
  let wallet = await Wallet.findOne({ user_id: userId })

  if (!wallet) {
    wallet = new Wallet({
      user_id: userId,
      balance: 0,
      currency: 'INR',
      wallet_type: walletType,
      status: 'active',
    })
    await wallet.save()
  }

  return wallet
} */

const statusOfLike = async (req, res, next) => {
  const { videoId } = req.body
  const userId = req.user.id.toString();
  if (!videoId) {
    return res.status(400).json({ message: 'Video ID is required' })
  }
  try {
    const video = await LongVideo.findById(videoId)

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }

    const isLiked =video.liked_by.some(like => like.user && like.user.toString() === userId)
    res.status(200).json({
      message: 'Like status retrieved successfully',
      isLiked,
      likes: video.likes,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const statusOfReshare = async (req, res, next) => {
  const { videoId } = req.body
  const userId = req.user.id.toString()
  if (!videoId) {
    return res.status(400).json({ message: 'Video ID is required' })
  }
  try {
    const video = await LongVideo.findById(videoId)

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }
    const reshares = await Reshare.find({ user: userId })
      .populate('long_video', 'name description thumbnailUrl')
      .populate('user', 'username profile_photo')
    const isReshared = reshares.some(
      (reshare) => reshare.long_video?._id.toString() === videoId
    )
    res.status(200).json({
      message: 'reshare status retrieved successfully',
      isReshared,
      video_reshares: reshares,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const statusOfUserFollowing = async (req, res, next) => {
  const { followingId } = req.body
  const userId = req.user.id.toString()
  if (!followingId) {
    return res.status(400).json({ message: 'Following ID is required' })
  }
  try {
    const followingUser = await User.findById(followingId).select('_id')

    if (!followingUser) {
      return res.status(404).json({ message: 'Following user not found' })
    }

    const user = await User.findById(userId).select('_id following').populate({
      path: 'following',
      select: 'username profile_photo _id',
    })
    const isFollowing = user.following.some(
      (followingUser) => followingUser._id.toString() === followingId
    )

    res.status(200).json({
      message: 'following status retrieved successfully',
      isFollowing,
      user_following: user.following,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}
const statusOfUserFollower = async (req, res, next) => {
  const { followerId } = req.body
  const userId = req.user.id.toString()

  if (!followerId) {
    return res.status(400).json({ message: 'Follower ID is required' })
  }

  try {
    const followerUser = await User.findById(followerId).select('_id')
    if (!followerUser) {
      return res.status(404).json({ message: 'Follower user not found' })
    }

    const user = await User.findById(userId).select('_id followers').populate({
      path: 'followers',
      select: 'username profile_photo _id',
    })

    const isFollower = user.followers.some(
      (follower) => follower._id.toString() === followerId
    )

    res.status(200).json({
      message: 'Follower status retrieved successfully',
      isFollower,
      user_followers: user.followers,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const LikeVideo = async (req, res, next) => {
  const { videoId } = req.body;
  const userId = req.user.id;

  if (!videoId) {
    return res.status(400).json({ message: 'Video ID is required' });
  }

  try {
    const video = await LongVideo.findById(videoId);

    if (!video || (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')) {
      return res.status(404).json({ message: 'Video not found' });
    }
    const hasLiked = video.liked_by.some(like => like.user && like.user.toString() === userId.toString());

    if (hasLiked) {
      // Unlike - FIX: Add 'new' keyword before mongoose.Types.ObjectId
      const updatedVideo = await LongVideo.findByIdAndUpdate(
        videoId,
        {
          $pull: { liked_by: { user: new mongoose.Types.ObjectId(userId) } },
          $inc: { likes: -1 }
        },
        { new: true }
      );

      // Ensure likes don't go negative
      if (updatedVideo.likes < 0) updatedVideo.likes = 0;
      await updatedVideo.save();

      await User.updateOne({ _id: userId }, { $pull: { liked_videos: videoId } });

      return res.status(200).json({
        message: 'Video unliked successfully',
        likes: updatedVideo.likes,
        isLiked: false
      });
    } else {
      // Like
      const updatedVideo = await LongVideo.findByIdAndUpdate(
        videoId,
        {
          $push: { liked_by: { user: userId, likedAt: new Date() } },
          $inc: { likes: 1 }
        },
        { new: true }
      );

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { liked_videos: videoId } },
        { new: true }
      );

      // Send notification
      await addVideoLikeNotificationToQueue(
        updatedVideo.created_by.toString(),
        userId,
        videoId,
        updatedUser.username,
        updatedVideo.name,
        updatedUser.profile_photo,
        updatedUser.FCM_token
      );

      return res.status(200).json({
        message: 'Video liked successfully',
        likes: updatedVideo.likes,
        isLiked: true
      });
    }
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const ShareVideo = async (req, res, next) => {
  const { videoId } = req.body
  const userId = req.user.id.toString()

  if (!videoId) {
    return res
      .status(400)
      .json({ message: 'Video ID and video type are required' })
  }

  try {
    let video = await LongVideo.findById(videoId)

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }
    video = await LongVideo.findOneAndUpdate(
      { _id: videoId },
      { $inc: { shares: 1 } },
      { new: true }
    )

    await User.findOneAndUpdate(
      { _id: userId },
      {
        $addToSet: { shared_videos: videoId },
      },
      { new: true }
    )

    res.status(200).json({
      message: 'Video shared successfully',
      shares: video.shares,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTotalSharesByVideoId = async (req, res, next) => {
  const { videoId } = req.params

  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'Video ID is required',
      code: 'MISSING_REQUIRED_FIELDS',
    })
  }

  try {
    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }
    const totalShares = video.shares || 0
    res.status(200).json({
      success: true,
      message: 'Total shares retrieved successfully',
      totalShares,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const CommentOnVideo = async (req, res, next) => {
  const { videoId, comment } = req.body
  const userId = req.user.id.toString()
  const user = await User.findById(userId)

  if (!videoId || !comment) {
    return res.status(400).json({
      message: 'Video ID and comment are required',
    })
  }

  try {
    let video = await LongVideo.findById(videoId)

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }

    const newComment = await Comment.create({
      user: userId,
      content: comment,
      long_video: videoId,
    })

    await newComment.save()
    
    // FIX: Increment comments count on video and properly push comment ID
    video = await LongVideo.findOneAndUpdate(
      { _id: videoId },
      { 
        $push: { comments: newComment._id },
        $inc: { comments_count: 1 } // Add this field to track comment count
      },
      { new: true }
    )

    const userCommentType = 'commented_videos'

    if (!Array.isArray(user[userCommentType])) {
      user[userCommentType] = []
    }
    if (
      !user[userCommentType]
        .map((id) => id.toString())
        .includes(videoId.toString())
    ) {
      user[userCommentType].push(videoId)
    }

    await user.save()
    
    //add comment notification to queue:
    const videoCreator = video.created_by.toString()
    const videoName = video.name
    const userName = user.username
    const userProfilePhoto = user.profile_photo
    const commentId = newComment._id
    const commentText = comment
    await addVideoCommentNotificationToQueue(
      videoCreator,
      userId,
      videoId,
      userName,
      videoName,
      userProfilePhoto,
      commentId,
      commentText
    )
    
    // FIX: Return the new comment data and updated count
    res.status(200).json({
      message: 'Comment added successfully',
      comments: video.comments.length,
      commentsCount: video.comments.length, // Consistent field name
      newComment: {
        _id: newComment._id,
        content: newComment.content,
        userId: user._id,
        username: user.username,
        profilePicture: user.profile_photo,
        createdAt: newComment.createdAt,
        upvotes: 0,
        downvotes: 0,
        gifts: 0,
        upvoted: false,
        downvoted: false
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getVideoComments = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const comments = await Comment.find({ 
      long_video: videoId,
      parent_comment: null 
    })
    .populate('user', '_id username profile_photo')
    .sort({ createdAt: -1 });
    
    const formattedComments = comments.map(comment => {
      const user = comment.user;
      
      return {
        _id: comment._id,
        content: comment.content,
        videoId: videoId,
        userId: user ? user._id : null,
        username: user ? user.username : 'Unknown User',
        profilePicture: user ? user.profile_photo : null, 
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        timestamp: comment.createdAt, // Add timestamp field for consistency
        likes: comment.likes || 0,
        upvotes: comment.upvotes || 0,
        downvotes: comment.downvotes || 0,
        gifts: comment.gifts || 0,
        donations: comment.gifts || 0, // Alias for gifts
        replies: comment.replies ? comment.replies.length : 0,
        repliesCount: comment.replies ? comment.replies.length : 0,
        // Add user interaction flags
        upvoted: comment.upvoted_by ? comment.upvoted_by.includes(req.user.id) : false,
        downvoted: comment.downvoted_by ? comment.downvoted_by.includes(req.user.id) : false,
        user: {
          id: user ? user._id : null,
          username: user ? user.username : 'Unknown User',
          name: user ? user.username : 'Unknown User',
          avatar: user ? user.profile_photo : null
        },
        is_monetized: true // Default to true
      };
    });
    
    res.status(200).json({
      success: true,
      comments: formattedComments,
      totalComments: formattedComments.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getCommentReplies = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { videoId, commentId } = req.params

    if (!videoId || !commentId) {
      return res.status(400).json({
        success: false,
        error: 'Video ID and Comment ID are required',
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    const commentReplies = await Comment.find({
      parent_comment: commentId,
    }).populate('user', '_id username profile_photo')

    if (!commentReplies || commentReplies.length === 0) {
      res.status(200).json({
        message: 'No replies found',
        replies: [],
        pagination: {
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 5,
          total: 0,
          totalPages: 0
        }
      })
      return
    }

    const replies = commentReplies
      .filter(reply => reply && reply.user && reply.content) // Filter out replies without valid users or content
      .map((reply) => {
        // Debug reply content
        console.log(`💬 Reply ${reply._id}: content="${reply.content}"`)

        return {
          _id: reply._id,
          content: reply.content,
          parentId: commentId,
          timestamp: reply.createdAt,
          donations: reply.donations || 0,
          upvotes: reply.upvotes || 0,
          downvotes: reply.downvotes || 0,
          user: {
            id: reply.user._id,
            name: reply.user.username || 'Anonymous User',
            username: reply.user.username || 'anonymous',
            avatar: reply.user.profile_photo || 'https://api.dicebear.com/7.x/identicon/svg?seed=anonymous',
          },
          upvoted: reply.upvoted_by ? reply.upvoted_by.includes(userId) : false,
          downvoted: reply.downvoted_by
            ? reply.downvoted_by.includes(userId)
            : false,
        }
      })

    res.status(200).json({
      message: 'Replies fetched successfully',
      replies: replies,
      pagination: {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 5,
        total: replies.length,
        totalPages: Math.ceil(replies.length / (parseInt(req.query.limit) || 5))
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

// Add upvote/downvote functionality
const upvoteComment = async (req, res, next) => {
  try {
    const { videoId, commentId } = req.body
    const userId = req.user.id.toString()

    let video = await LongVideo.findById(videoId)
    const user = await User.findById(userId).select('username profile_photo')
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
      console.log('❌ Comment not found:', commentId);
      return res.status(404).json({ error: 'Comment not found' })
    }

    console.log('📝 Comment found:', {
      id: comment._id,
      content: comment.content.substring(0, 50),
      videoId: comment.long_video,
      upvotes: comment.upvotes,
      upvoted_by_count: comment.upvoted_by.length
    });

    // Verify comment belongs to this video
    if (comment.long_video.toString() !== videoId) {
      console.log('❌ Comment video mismatch:', { commentVideo: comment.long_video.toString(), requestVideo: videoId });
      return res.status(400).json({ error: 'Comment does not belong to this video' })
    }

    // Remove from downvotes if exists
    if (comment.downvoted_by.includes(userId)) {
      comment.downvoted_by.pull(userId)
      comment.downvotes = Math.max(0, comment.downvotes - 1)
    }

    // Toggle upvote
    const alreadyUpvoted = comment.upvoted_by.includes(userId)
    console.log('🔍 Vote status:', { alreadyUpvoted, userId, upvoted_by: comment.upvoted_by });

    if (alreadyUpvoted) {
      comment.upvoted_by.pull(userId)
      comment.upvotes = Math.max(0, comment.upvotes - 1)
      console.log('👎 Removed upvote');
    } else {
      comment.upvoted_by.push(userId)
      comment.upvotes += 1
      console.log('👍 Added upvote');
    }

    await comment.save()
    if (!alreadyUpvoted) {
      //add upvote notification to queue
      const commentcreator = comment.user.toString()
      const userName = user.username
      const userProfilePhoto = user.profile_photo
      const videoName = video.name
      await addCommentUpvoteNotificationToQueue(
        commentcreator,
        userId,
        videoId,
        userName,
        videoName,
        userProfilePhoto,
        commentId,
        user.FCM_token
      )
    }

    res.status(200).json({
      success: true,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      upvoted: comment.upvoted_by.includes(userId),
      downvoted: comment.downvoted_by.includes(userId),
    })
  } catch (error) {
    console.error('❌ Error in upvoteComment:', error)
    handleError(error, req, res, next)
  }
}

const downvoteComment = async (req, res, next) => {
  try {
    const { videoId, commentId } = req.body
    const userId = req.user.id.toString()

    const video = await LongVideo.findById(videoId)

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' })
    }

    // Verify comment belongs to this video
    if (comment.long_video.toString() !== videoId) {
      return res.status(400).json({ error: 'Comment does not belong to this video' })
    }

    // Remove from upvotes if exists
    if (comment.upvoted_by.includes(userId)) {
      comment.upvoted_by.pull(userId)
      comment.upvotes = Math.max(0, comment.upvotes - 1)
    }

    // Toggle downvote
    if (comment.downvoted_by.includes(userId)) {
      comment.downvoted_by.pull(userId)
      comment.downvotes = Math.max(0, comment.downvotes - 1)
    } else {
      comment.downvoted_by.push(userId)
      comment.downvotes += 1
    }

    await comment.save()

    res.status(200).json({
      success: true,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      upvoted: comment.upvoted_by.includes(userId),
      downvoted: comment.downvoted_by.includes(userId),
    })
  } catch (error) {
    console.error('❌ Error in downvoteComment:', error)
    handleError(error, req, res, next)
  }
}

const GiftComment = async (req, res, next) => {
  try {
    const { videoId, commentId, amount, giftNote } = req.body
    const gifterId = req.user.id.toString()
    
    console.log(`💰 GiftComment function called:`, {
      videoId,
      commentId,
      amount,
      gifterId,
      giftNote
    });

    // Validation
    if (!videoId || !commentId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Video ID, comment ID, and amount are required',
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    const videoValidation = validateObjectId(videoId, 'Video ID')
    if (!videoValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: videoValidation.error,
        code: 'INVALID_VIDEO_ID',
      })
    }

    const commentValidation = validateObjectId(commentId, 'Comment ID')
    if (!commentValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: commentValidation.error,
        code: 'INVALID_COMMENT_ID',
      })
    }

    const amountValidation = validateAmount(amount)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    if (giftNote && giftNote.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Gift note must be less than 200 characters',
        code: 'INVALID_GIFT_NOTE',
      })
    }

    const video = await LongVideo.findById(videoId)

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }

    // Find the comment
    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found',
        code: 'COMMENT_NOT_FOUND',
      })
    }
    
    console.log(`💰 Found comment:`, {
      id: comment._id,
      content: comment.content.substring(0, 30),
      currentGifts: comment.gifts || 0,
      user: comment.user
    });

    const isTopLevelComment = comment.parent_comment === null

    if (!isTopLevelComment) {
      return res.status(400).json({
        success: false,
        error: 'Cannot gift replies to comments, only original comments',
        code: 'CANNOT_GIFT_REPLIES',
      })
    }

    const commentAuthorId = comment.user

    // Check if user is trying to gift themselves
    if (commentAuthorId.toString() === gifterId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot gift yourself',
        code: 'CANNOT_GIFT_SELF',
      })
    }

    // Get user details
    const receiver = await User.findById(commentAuthorId).select(
      'username comment_monetization_enabled'
    )

    if (!receiver) {
      return res.status(404).json({
        success: false,
        error: 'Comment author not found',
        code: 'COMMENT_AUTHOR_NOT_FOUND',
      })
    }

    if (!receiver.comment_monetization_enabled) {
      return res.status(400).json({
        success: false,
        error: 'Comment author has disabled comment monetization',
        code: 'COMMENT_MONETIZATION_DISABLED',
      })
    }

    // Get wallets
    const gifterWallet = await Wallet.findOne({ user_id: gifterId })
    if (!gifterWallet) {
      return res.status(400).json({
        success: false,
        error: 'gifter wallet not found',
        code: 'GIFTER_WALLET_NOT_FOUND',
      })
    }
    const receiverWallet = await Wallet.findOne({ user_id: commentAuthorId })
    if (!receiverWallet) {
      return res.status(400).json({
        success: false,
        error: 'receiver wallet not found',
        code: 'RECEIVER_WALLET_NOT_FOUND',
      })
    }
    // Check gifter's wallet balance
    if (gifterWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: gifterWallet.balance,
        requiredAmount: amount,
        shortfall: amount - gifterWallet.balance,
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    // Check wallet statuses
    if (gifterWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Your wallet is not active',
        code: 'WALLET_INACTIVE',
      })
    }

    if (receiverWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: "Receiver's wallet is not active",
        code: 'RECEIVER_WALLET_INACTIVE',
      })
    }

    const session = await mongoose.startSession()

    const gifterBalanceBefore = gifterWallet.balance
    const receiverBalanceBefore = receiverWallet.balance
    let walletTransfer

    try {
      await session.withTransaction(async () => {
        const gifterBalanceAfter = gifterBalanceBefore - amount
        const receiverBalanceAfter = receiverBalanceBefore + amount

        walletTransfer = new WalletTransfer({
          sender_id: gifterId,
          receiver_id: commentAuthorId,
          sender_wallet_id: gifterWallet._id,
          receiver_wallet_id: receiverWallet._id,
          total_amount: amount,
          creator_amount: amount,
          platform_amount: 0,
          currency: 'INR',
          transfer_type: 'comment_gift',
          content_id: videoId,
          content_type: 'LongVideo',
          description: `Gift for comment: ${comment.content.substring(0, 50)}...`,
          sender_balance_before: gifterBalanceBefore,
          sender_balance_after: gifterBalanceAfter,
          receiver_balance_before: receiverBalanceBefore,
          receiver_balance_after: receiverBalanceAfter,
          platform_fee_percentage: 0,
          creator_share_percentage: 100,
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: receiver.username,
            transfer_note: giftNote || '',
            comment_id: commentId,
            comment_text: comment.content.substring(0, 100),
            video_id: videoId,
          },
        })

        await walletTransfer.save({ session })

        // Update wallets
        gifterWallet.balance = gifterBalanceAfter
        gifterWallet.total_spent += amount
        gifterWallet.last_transaction_at = new Date()
        await gifterWallet.save({ session })

        receiverWallet.balance = receiverBalanceAfter
        receiverWallet.total_received += amount

        receiverWallet.last_transaction_at = new Date()
        await receiverWallet.save({ session })

        // Create gifter transaction
        const gifterTransaction = new WalletTransaction({
          wallet_id: gifterWallet._id,
          user_id: gifterId,
          transaction_type: 'debit',
          transaction_category: 'comment_gift',
          amount: amount,
          currency: 'INR',
          description: `Gift sent to ${receiver.username} for comment on "${video.name.substring(0, 30)}..."`,
          balance_before: gifterBalanceBefore,
          balance_after: gifterBalanceAfter,
          content_id: videoId,
          content_type: 'LongVideo',
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: receiver.username,
            comment_id: commentId,
            comment_text: comment.content.substring(0, 100),
            video_id: videoId,
            transfer_id: walletTransfer._id,
          },
        })

        await gifterTransaction.save({ session })

        // Create receiver transaction
        const receiverTransaction = new WalletTransaction({
          wallet_id: receiverWallet._id,
          user_id: commentAuthorId,
          transaction_type: 'credit',
          transaction_category: 'gift_received',
          amount: amount,
          currency: 'INR',
          description: `Gift received from ${req.user.username} for your comment on "${video.name.substring(0, 30)}..."`,
          balance_before: receiverBalanceBefore,
          balance_after: receiverBalanceAfter,
          content_id: videoId,
          content_type: 'LongVideo',
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: req.user.username,
            comment_id: commentId,
            comment_text: comment.content.substring(0, 100),
            video_id: videoId,
            transfer_id: walletTransfer._id,
          },
        })

        await receiverTransaction.save({ session })

        // Update comment gift count and gifted_by array
        try {
          console.log(`💰 Updating comment ${commentId} with gift amount ${amount} from user ${gifterId}`);
          const updatedComment = await Comment.findByIdAndUpdate(
            commentId,
            {
              $inc: { gifts: amount },
              $addToSet: { gifted_by: gifterId }
            },
            { session, new: true }
          );
          console.log(`💰 Comment updated successfully. New gift count: ${updatedComment?.gifts || 0}`);
        } catch (commentUpdateError) {
          console.error(`❌ Error updating comment ${commentId}:`, commentUpdateError);
          // Don't throw here to avoid breaking the transaction
        }
      })

      await session.endSession()
      
      // Verify the comment was updated (outside transaction for debugging)
      const verifyComment = await Comment.findById(commentId);
      console.log(`💰 Verification: Comment ${commentId} now has ${verifyComment?.gifts || 0} gifts`);
      //send comment gift notification
      const gifter = await User.findById(gifterId).select('username profile_photo')
      const user = await User.findById(comment.user.toString()).select(
        'FCM_token'
      )
      await addCommentGiftNotificationToQueue(
        comment.user.toString(),
        gifterId,
        videoId,
        gifter.username,
        video.name,
        gifter.profile_photo,
        commentId,
        amount,
        user.FCM_token
      )

      // add gift details to comment
      comment.gifts+=amount
      comment.gifted_by.push(gifterId)
      await comment.save()
      res.status(200).json({
        success: true,
        message: 'Gift sent successfully!',
        gift: {
          amount: amount,
          from: req.user.username,
          to: receiver.username,
          videoTitle: video.name,
          commentPreview: comment.content.substring(0, 100),
          giftNote: giftNote || '',
          transferType: 'comment_gift',
        },
        gifter: {
          balanceBefore: gifterBalanceBefore,
          balanceAfter: gifterWallet.balance,
          currentBalance: gifterWallet.balance,
        },
        receiver: {
          balanceBefore: receiverBalanceBefore,
          balanceAfter: receiverWallet.balance,
          currentBalance: receiverWallet.balance,
          receivedAmount: amount,
        },
        transfer: {
          id: walletTransfer._id,
          createdAt: new Date(),
        },
      })
    } catch (transactionError) {
      await session.abortTransaction()
      throw transactionError
    } finally {
      if (session.inTransaction()) {
        await session.endSession()
      }
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}


const reshareVideo = async (req, res, next) => {
  const { videoId } = req.body
  const userId = req.user.id.toString()

  try {
    if (!videoId) {
      return res.status(400).json({ message: 'Video ID is required' })
    }

    const user = await User.findById(userId).select('username profile_photo')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }
    const existingReshare = await Reshare.findOne({
      user: userId,
      long_video: videoId,
    })

    if (existingReshare) {
      await Reshare.deleteOne({ _id: existingReshare._id })
      await LongVideo.updateOne(
        { _id: videoId, shares: { $gt: 0 } },
        { $inc: { shares: -1 } }
      )

      const totalReshares = await Reshare.countDocuments({
        long_video: videoId,
      })

      return res.status(200).json({
        message: `video:${videoId} un-reshared by user:${userId} successfully`,
        totalReshares,
      })
    }

    await Reshare.create({ user: userId, long_video: videoId })

    const totalReshares = await Reshare.countDocuments({ long_video: videoId })
    await LongVideo.updateOne({ _id: videoId }, { $inc: { shares: 1 } })

    // Fetch FCM token of the creator
    const videoCreator = await User.findById(video.created_by).select(
      'FCM_token'
    )
    const fcmToken = videoCreator?.FCM_token || null

    // Queue reshare notification
    await addVideoReshareNotificationToQueue(
      video.created_by.toString(),
      userId,
      videoId,
      user.username,
      video.name,
      user.profile_photo,
      fcmToken
    )

    return res.status(200).json({
      message: `video:${videoId} reshared by user:${userId} successfully`,
      totalReshares,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const saveVideo = async (req, res, next) => {
  try {
    const { videoId, videoType, seriesId } = req.body
    const userId = req.user.id.toString()

    if (!videoId || !videoType) {
      return res
        .status(400)
        .json({ message: 'Video ID and video type are required' })
    }

    if (!['long', 'series'].includes(videoType)) {
      return res
        .status(400)
        .json({ message: "Video type must be 'long' or 'series'" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (videoType === 'series') {
      if (!seriesId) {
        return res
          .status(400)
          .json({ message: 'Series ID is required for series type' })
      }

      const series = await Series.findById(seriesId)
      if (!series) {
        return res.status(404).json({ message: 'Series not found' })
      }

      if (user.saved_series.includes(seriesId)) {
        return res.status(400).json({ message: 'Series already saved' })
      }

      user.saved_series.push(seriesId)
      await user.save()
      return res
        .status(200)
        .json({ message: 'Series saved successfully', seriesId })
    }

    if (videoType === 'long') {
      const video = await LongVideo.findById(videoId)
      if (
        !video ||
        (video.visibility === 'hidden' &&
          video.hidden_reason === 'video_deleted')
      ) {
        return res.status(404).json({ message: 'Long video not found' })
      }

      if (user.saved_videos.includes(videoId)) {
        return res.status(400).json({ message: 'Video already saved' })
      }

      user.saved_videos.push(videoId)
      await user.save()
      return res
        .status(200)
        .json({ message: 'Video saved successfully', videoId })
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const checkForSaveVideo = async (req, res, next) => {
  const { videoId, videoType, seriesId } = req.body
  const userId = req.user.id.toString()
  if (!videoId || !videoType || !seriesId) {
    return res
      .status(400)
      .json({ message: 'Video ID, video type and series ID are required' })
  }
  if (!['long', 'series'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'series'" })
  }
  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    let isSaved = false
    if (videoType === 'series') {
      isSaved = user.saved_series.includes(seriesId)
    } else if (videoType === 'long') {
      isSaved = user.saved_videos.includes(videoId)
    }
    res.status(200).json({ isSaved })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const ReplyToComment = async (req, res, next) => {
  const { videoId, commentId, reply } = req.body
  const userId = req.user.id.toString()
  
  if (!videoId || !commentId || !reply) {
    return res.status(400).json({
      message: 'Video ID, comment ID and reply are required',
    })
  }

  try {
    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }
    
    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' })
    }
    if (comment.long_video.toString() !== videoId) {
      return res
        .status(404)
        .json({ message: 'Comment not associated with this video' })
    }

    const newReply = await Comment.create({
      user: userId,
      long_video: videoId,
      parent_comment: commentId,
      content: reply,
    })
    
    // FIX: Properly update the parent comment
    await Comment.findByIdAndUpdate(
      commentId,
      { 
        $push: { replies: newReply._id },
        $inc: { reply_count: 1 } // Track reply count
      },
      { new: true }
    )

    // Get user data for response
    const user = await User.findById(userId).select('username profile_photo')
    
    //send reply notification
    await addCommentReplyNotificationToQueue(
      comment.user.toString(),
      userId,
      videoId,
      user.username,
      video.name,
      user.profile_photo,
      commentId,
      newReply._id.toString(),
      reply
    )

    // FIX: Return the new reply data
    res.status(200).json({
      message: 'Reply added successfully',
      repliesCount: comment.replies.length + 1,
      newReply: {
        _id: newReply._id,
        content: newReply.content,
        parentId: commentId,
        timestamp: newReply.createdAt,
        gifts: 0,
        upvotes: 0,
        downvotes: 0,
        user: {
          id: user._id,
          name: user.username,
          username: user.username,
          avatar: user.profile_photo || '',
        },
        upvoted: false,
        downvoted: false,
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const UpvoteReply = async (req, res, next) => {
  const { videoId, replyId } = req.body
  const userId = req.user.id.toString()
  if (!videoId || !replyId) {
    return res.status(400).json({
      message: 'Video ID, comment ID and reply ID are required',
    })
  }

  try {
    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }

    const reply = await Comment.findById(replyId)
    if (!reply) {
      return res.status(404).json({ message: 'Reply not found' })
    }
    if (reply.long_video.toString() !== videoId) {
      return res
        .status(400)
        .json({ message: 'Reply not associated with this video' })
    }
    const alreadyUpvoted = reply.upvoted_by.includes(userId)
    if (alreadyUpvoted) {
      reply.upvoted_by.pull(userId)
      reply.upvotes = Math.max(0, reply.upvotes - 1)
    } else {
      reply.upvoted_by.push(userId)
      reply.upvotes += 1
    }
    await reply.save()
    if (!alreadyUpvoted) {
      //send reply upvote notification
      const user = await User.findById(userId).select(
        'username profile_photo FCM_token'
      )
      await addCommentUpvoteNotificationToQueue(
        reply.user.toString(),
        userId,
        videoId,
        user.username,
        video.name,
        user.profile_photo,
        reply._id.toString(),
        user.FCM_token
      )
    }
    res
      .status(200)
      .json({ message: 'Reply upvoted successfully', upvotes: reply.upvotes })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const DownvoteReply = async (req, res, next) => {
  const { videoId, commentId, replyId } = req.body
  const userId = req.user.id.toString()
  if (!videoId || !commentId || !replyId) {
    return res.status(400).json({
      message: 'Video ID, comment ID and reply ID are required',
    })
  }

  try {
    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ message: 'Video not found' })
    }
    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' })
    }

    const reply = await Comment.findById(replyId)
    if (!reply) {
      return res.status(404).json({ message: 'Reply not found' })
    }
    if (reply.downvoted_by.includes(userId)) {
      reply.downvoted_by.pull(userId)
      reply.downvotes = Math.max(0, reply.downvotes - 1)
    } else {
      reply.downvoted_by.push(userId)
      reply.downvotes += 1
    }
    await reply.save()
    res.status(200).json({
      message: 'Reply downvoted successfully',
      downvotes: reply.downvotes,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const UnsaveVideo = async (req, res, next) => {
  const { videoId, videoType, seriesId } = req.body
  const userId = req.user.id.toString()

  if (!videoId || !videoType || !seriesId) {
    return res
      .status(400)
      .json({ message: 'Video ID video type and series ID are required' })
  }

  if (!['long', 'series'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'series'" })
  }

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (videoType === 'series') {
      if (!seriesId) {
        return res
          .status(400)
          .json({ message: 'Series ID is required for series type' })
      }

      const wasPresent = user.saved_series.some(
        (id) => id.toString() === seriesId
      )
      if (!wasPresent) {
        return res
          .status(400)
          .json({ message: 'Series not found in saved list' })
      }

      user.saved_series = user.saved_series.filter(
        (id) => id.toString() !== seriesId
      )
      await user.save()
      return res
        .status(200)
        .json({ message: 'Series unsaved successfully', seriesId })
    }

    if (videoType === 'long') {
      const wasPresent = user.saved_videos.some(
        (id) => id.toString() === videoId
      )
      if (!wasPresent) {
        return res
          .status(400)
          .json({ message: 'Video not found in saved list' })
      }

      user.saved_videos = user.saved_videos.filter(
        (id) => id.toString() !== videoId
      )
      await user.save()
      return res
        .status(200)
        .json({ message: 'Video unsaved successfully', videoId })
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const GiftVideo = async (req, res, next) => {
  try {
    const { videoId, amount, giftNote } = req.body
    const gifterId = req.user.id.toString()

    // Validation
    if (!videoId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Video ID and amount are required',
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    const videoValidation = validateObjectId(videoId, 'Video ID')
    if (!videoValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: videoValidation.error,
        code: 'INVALID_VIDEO_ID',
      })
    }

    const amountValidation = validateAmount(amount)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    if (giftNote && giftNote.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Gift note must be less than 200 characters',
        code: 'INVALID_GIFT_NOTE',
      })
    }

    const video = await LongVideo.findById(videoId).populate('created_by', 'username')

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }

    const videoCreatorId = video.created_by._id

    // Check if user is trying to gift themselves
    if (videoCreatorId.toString() === gifterId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot gift yourself',
        code: 'CANNOT_GIFT_SELF',
      })
    }

    // Note: Video monetization check removed for testing
    // TODO: Add video_monetization_enabled field to User model if needed

    // Get wallets
    const gifterWallet = await Wallet.findOne({ user_id: gifterId })
    if (!gifterWallet) {
      return res.status(400).json({
        success: false,
        error: 'Gifter wallet not found',
        code: 'GIFTER_WALLET_NOT_FOUND',
      })
    }

    const receiverWallet = await Wallet.findOne({ user_id: videoCreatorId })
    if (!receiverWallet) {
      return res.status(400).json({
        success: false,
        error: 'Receiver wallet not found',
        code: 'RECEIVER_WALLET_NOT_FOUND',
      })
    }

    // Check gifter's wallet balance
    if (gifterWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: gifterWallet.balance,
        requiredAmount: amount,
        shortfall: amount - gifterWallet.balance,
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    // Check wallet statuses
    if (gifterWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Your wallet is not active',
        code: 'WALLET_INACTIVE',
      })
    }

    if (receiverWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: "Receiver's wallet is not active",
        code: 'RECEIVER_WALLET_INACTIVE',
      })
    }

    const session = await mongoose.startSession()

    const gifterBalanceBefore = gifterWallet.balance
    const receiverBalanceBefore = receiverWallet.balance
    let walletTransfer

    try {
      await session.withTransaction(async () => {
        const gifterBalanceAfter = gifterBalanceBefore - amount
        const receiverBalanceAfter = receiverBalanceBefore + amount

        walletTransfer = new WalletTransfer({
          sender_id: gifterId,
          receiver_id: videoCreatorId,
          sender_wallet_id: gifterWallet._id,
          receiver_wallet_id: receiverWallet._id,
          total_amount: amount,
          creator_amount: amount,
          platform_amount: 0,
          currency: 'INR',
          transfer_type: 'video_gift',
          content_id: videoId,
          content_type: 'LongVideo',
          description: `Gift for video: ${video.name.substring(0, 50)}...`,
          sender_balance_before: gifterBalanceBefore,
          sender_balance_after: gifterBalanceAfter,
          receiver_balance_before: receiverBalanceBefore,
          receiver_balance_after: receiverBalanceAfter,
          platform_fee_percentage: 0,
          creator_share_percentage: 100,
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: video.created_by.username,
            transfer_note: giftNote || '',
            video_id: videoId,
          },
        })

        await walletTransfer.save({ session })

        // Update wallets
        gifterWallet.balance = gifterBalanceAfter
        gifterWallet.total_spent += amount
        gifterWallet.last_transaction_at = new Date()
        await gifterWallet.save({ session })

        receiverWallet.balance = receiverBalanceAfter
        receiverWallet.total_received += amount
        receiverWallet.last_transaction_at = new Date()
        await receiverWallet.save({ session })

        // Update video gifts count
        await LongVideo.findByIdAndUpdate(
          videoId,
          { $inc: { gifts: amount } },
          { session }
        )

        // Create gifter transaction
        const gifterTransaction = new WalletTransaction({
          wallet_id: gifterWallet._id,
          user_id: gifterId,
          transaction_type: 'debit',
          transaction_category: 'video_gift',
          amount: amount,
          currency: 'INR',
          description: `Gift sent to ${video.created_by.username} for video "${video.name.substring(0, 30)}..."`,
          balance_before: gifterBalanceBefore,
          balance_after: gifterBalanceAfter,
          content_id: videoId,
          content_type: 'LongVideo',
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: video.created_by.username,
            video_id: videoId,
            transfer_id: walletTransfer._id,
          },
        })

        await gifterTransaction.save({ session })

        // Create receiver transaction
        const receiverTransaction = new WalletTransaction({
          wallet_id: receiverWallet._id,
          user_id: videoCreatorId,
          transaction_type: 'credit',
          transaction_category: 'gift_received',
          amount: amount,
          currency: 'INR',
          description: `Gift received from ${req.user.username} for your video "${video.name.substring(0, 30)}..."`,
          balance_before: receiverBalanceBefore,
          balance_after: receiverBalanceAfter,
          content_id: videoId,
          content_type: 'LongVideo',
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: req.user.username,
            video_id: videoId,
            transfer_id: walletTransfer._id,
          },
        })

        await receiverTransaction.save({ session })
      })

      await session.endSession()

      res.status(200).json({
        success: true,
        message: 'Video gift sent successfully',
        gift: {
          amount: amount,
          recipient: video.created_by.username,
          video_title: video.name,
          transfer_id: walletTransfer._id,
        },
        wallet: {
          balance: gifterWallet.balance,
        },
      })
    } catch (transactionError) {
      await session.endSession()
      throw transactionError
    }
  } catch (error) {
    console.error('❌ Error in GiftVideo:', error)
    handleError(error, req, res, next)
  }
}

const deleteComment = async (req, res, next) => {
  try {
    const { commentId, videoId } = req.body;
    const userId = req.user.id.toString();

    // Input validation
    if (!commentId || !videoId) {
      return res.status(400).json({ error: 'commentId and videoId are required' });
    }

    // Find the comment
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if comment is monetized
    if (comment.gifts > 0) {
      return res.status(403).json({ 
        error: 'Monetized comment cannot be deleted', 
        commentId 
      });
    }

    // Check user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check video exists and is not deleted
    const video = await LongVideo.findById(videoId);
    if (!video || (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')) {
      return res.status(404).json({ error: 'Video not found' });
    }

    console.log(userId, comment.user.toString(), video.created_by.toString());

    //Authorization check
    if (comment.user.toString() !== userId && video.created_by.toString() !== userId) {
      return res.status(403).json({ 
        error: 'User not authorized to delete this comment' 
      });
    }

    // Start deletion process
    // 1. Delete the comment itself
    await Comment.deleteOne({ _id: commentId });

    // 2. Remove from video's comments array
    await LongVideo.findOneAndUpdate(
      { _id: videoId },
      { $pull: { comments: commentId } },
      { new: true }
    );

    // 3. Handle parent comment updates if this is a reply
    if (comment.parent_comment) { // Check if parent_comment exists before toString()
      const parentComment = await Comment.findById(comment.parent_comment);
      if (parentComment) {
        parentComment.replies = parentComment.replies.filter(
          reply => reply.toString() !== commentId
        );
        await parentComment.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      commentId,
      type: comment.parent_comment ? 'reply' : 'comment'
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    handleError(error, req, res, next);
  }
};

const getCommentDetails=async(req,res,next)=>{
  try{
    const userId=req.user.id.toString()
    const {commentId}=req.params
    if(!commentId){
      return res.status(400).json({error:'commentId is required'})
    }
    const commentDetails=await Comment.findById(commentId)
    if(!commentDetails){
      return res.status(404).json({error:'Comment not found'})
    }
    const hasUpvoted=commentDetails.upvoted_by.includes(userId)
    const hasDownvoted=commentDetails.downvoted_by.includes(userId)
    res.status(200).json({
      comment:{
        id:commentDetails._id,
        content:commentDetails.content,
        upvotes:commentDetails.upvotes,
        downvotes:commentDetails.downvotes,
        gifts:commentDetails.gifts,
        user:commentDetails.user,
        parent_comment:commentDetails.parent_comment,
        createdAt:commentDetails.createdAt,
        updatedAt:commentDetails.updatedAt,
        repliesLength:commentDetails.replies.length,
        upvoted:hasUpvoted,
        downvoted:hasDownvoted
      }
    })
  }catch(error){
    handleError(error, req, res, next)
  }
}

module.exports = {
  ReplyToComment,
  UpvoteReply,
  DownvoteReply,
  UnsaveVideo,
  checkForSaveVideo,
  LikeVideo,
  ShareVideo,
  CommentOnVideo,
  GiftComment,
  GiftVideo,
  reshareVideo,
  getVideoComments,
  getCommentReplies,
  upvoteComment,
  downvoteComment,
  statusOfLike,
  saveVideo,
  getTotalSharesByVideoId,
  deleteComment,
  getCommentDetails
}
