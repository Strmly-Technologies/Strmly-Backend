const LongVideo = require('../models/LongVideo')
const ShortVideo = require('../models/ShortVideos')
const Comment = require('../models/Comment')
const Wallet = require('../models/Wallet')
const WalletTransaction = require('../models/WalletTransaction')
const WalletTransfer = require('../models/WalletTransfer')
const User = require('../models/User')
const Series = require('../models/Series')
const mongoose = require('mongoose')
const { handleError } = require('../utils/utils')

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

const getOrCreateWallet = async (userId, walletType = 'user') => {
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
}

const statusOfLike=async(req,res,next)=>{
  const { videoId, videoType } = req.body
  const userId = req.user.id
  if (!videoId || !videoType) {
    return res
      .status(400)
      .json({ message: 'Video ID and video type are required' })
  }
  if (!['long', 'short'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'short'" })
  }
  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo
    const video = await VideoModel.findById(videoId)

    if (!video) {
      return res.status(404).json({ message: 'Video not found' })
    }

    const isLiked = video.liked_by.includes(userId)

    res.status(200).json({
      message: 'Like status retrieved successfully',
      isLiked,
      likes: video.likes,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}



const LikeVideo = async (req, res, next) => {
  const { videoId, videoType } = req.body
  const userId = req.user.id

  if (!videoId || !videoType) {
    return res
      .status(400)
      .json({ message: 'Video ID and video type are required' })
  }

  if (!['long', 'short'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'short'" })
  }

  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo
    const video = await VideoModel.findById(videoId)

    if (!video) {
      return res.status(404).json({ message: 'Video not found' })
    }

    const hasLiked = video.liked_by.includes(userId)
    const user = await User.findById(userId)

    if (hasLiked) {
      // Unlike the video
      video.liked_by.pull(userId)
      video.likes = Math.max(0, video.likes - 1)
      
      if (Array.isArray(user.liked_videos)) {
        user.liked_videos.pull(videoId)
      }

      await video.save()
      await user.save()

      res.status(200).json({
        message: 'Video unliked successfully',
        likes: video.likes,
        isLiked: false,
      })
    } else {
      // Like the video
      video.liked_by.push(userId)
      video.likes += 1

      if (!Array.isArray(user.liked_videos)) {
        user.liked_videos = []
      }
      if (!user.liked_videos.includes(videoId)) {
        user.liked_videos.push(videoId)
      }

      await video.save()
      await user.save()

      res.status(200).json({
        message: 'Video liked successfully',
        likes: video.likes,
        isLiked: true,
      })
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const ShareVideo = async (req, res, next) => {
  const { videoId, videoType } = req.body
  const userId = req.user.id

  if (!videoId || !videoType) {
    return res
      .status(400)
      .json({ message: 'Video ID and video type are required' })
  }

  if (!['long', 'short'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'short'" })
  }

  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo
    const video = await VideoModel.findById(videoId)

    if (!video) {
      return res.status(404).json({ message: 'Video not found' })
    }

    video.shares += 1
    await video.save()

    const user = await User.findById(userId)
    // Fix: Use shared_videos instead of sharedVideos
    if (!Array.isArray(user.shared_videos)) {
      user.shared_videos = []
    }
    if (!user.shared_videos.includes(videoId)) {
      user.shared_videos.push(videoId)
      await user.save()
    }

    res.status(200).json({
      message: 'Video shared successfully',
      shares: video.shares,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}


const getTotalSharesByVideoId=async(req,res,next)=>{
  const { videoId } = req.params
  const { videoType } = req.query
  if (!videoId || !videoType) {
    return res.status(400).json({
      success: false,
      error: 'Video ID and video type are required',
      code: 'MISSING_REQUIRED_FIELDS',
    })
  }
  if (!['long', 'short'].includes(videoType)) {
    return res.status(400).json({
      success: false,
      error: "Video type must be 'long' or 'short'",
      code: 'INVALID_VIDEO_TYPE',
    })
  }
  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo
    const video = await VideoModel.findById(videoId)
    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }
    const totalShares=video.shares || 0
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
  const { videoId, videoType, comment } = req.body
  const userId = req.user.id

  if (!videoId || !videoType || !comment) {
    return res.status(400).json({
      message: 'Video ID, video type, and comment are required',
    })
  }

  if (!['long', 'short'].includes(videoType)) {
    return res
      .status(400)
      .json({ message: "Video type must be 'long' or 'short'" })
  }

  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo
    const video = await VideoModel.findById(videoId)

    if (!video) {
      return res.status(404).json({ message: 'Video not found' })
    }

    const newComment = await Comment.create({
    user: userId,
    content: comment,
    [videoType === 'long' ? 'long_video' : 'short_video']: videoId,
   });

    await newComment.save()
    video.comments.push(newComment._id) 

    await video.save()
   
    const user = await User.findById(userId)
    const userCommentType= videoType==='long'? 'commented_long_videos':'commented_short_videos'
    
    if (!Array.isArray(user[userCommentType])) {
      user[userCommentType] = []
    }
    if (!user[userCommentType].map(id => id.toString()).includes(videoId.toString())) {
      user[userCommentType].push(videoId)
    }
 
    await user.save()
    res.status(200).json({
      message: 'Comment added successfully',
      comments: video.comments.length,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getVideoComments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { videoId } = req.params;
    const { videoType = 'long' } = req.query;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'Video ID is required',
        code: 'MISSING_VIDEO_ID',
      });
    }

    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo;

    const video = await VideoModel.findById(videoId)
      .populate('comments.user', 'username profile_photo')
      .populate('created_by', 'username profile_photo');

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      });
    }

    const comments = video.comments.map((comment) => ({
      _id: comment._id,
      content: comment.content,
      videoId: videoId,
      replies: comment.replies ? comment.replies.length : 0,
      timestamp: comment.createdAt,
      donations: comment.donations || 0,
      upvotes: comment.upvotes || 0,
      downvotes: comment.downvotes || 0,
      likes:comment.likes || 0,
      user: {
        id: comment.user._id,
        name: comment.user.username,
        avatar: comment.user.profile_photo || '',
      },
      upvoted: comment.upvoted_by ? comment.upvoted_by.includes(userId) : false,
      downvoted: comment.downvoted_by ? comment.downvoted_by.includes(userId) : false,
      liked: comment.liked_by ? comment.liked_by.includes(userId) : false,
    }));

    res.status(200).json(comments);
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getCommentReplies = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { videoId, commentId } = req.params;
    const { videoType = 'long' } = req.query;

    if (!videoId || !commentId) {
      return res.status(400).json({
        success: false,
        error: 'Video ID and Comment ID are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo;

    const video = await VideoModel.findById(videoId)
      .populate('comments.replies.user', 'username profile_photo');

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      });
    }

    const comment = video.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found',
        code: 'COMMENT_NOT_FOUND',
      });
    }

    const replies = comment.replies.map((reply) => ({
      _id: reply._id,
      content: reply.reply,
      parentId: commentId,
      timestamp: reply.createdAt,
      donations: reply.donations || 0,
      upvotes: reply.upvotes || 0,
      downvotes: reply.downvotes || 0,
      user: {
        id: reply.user._id,
        name: reply.user.username,
        username: reply.user.username,
        avatar: reply.user.profile_photo || '',
      },
      upvoted: reply.upvoted_by ? reply.upvoted_by.includes(userId) : false,
      downvoted: reply.downvoted_by ? reply.downvoted_by.includes(userId) : false,
    }));

    res.status(200).json(replies);
  } catch (error) {
    handleError(error, req, res, next);
  }
};

// Add upvote/downvote functionality
const upvoteComment = async (req, res, next) => {
  try {
    const { videoId, commentId, videoType = 'long' } = req.body;
    const userId = req.user.id;

    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const comment = video.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Remove from downvotes if exists
    if (comment.downvoted_by.includes(userId)) {
      comment.downvoted_by.pull(userId);
      comment.downvotes = Math.max(0, comment.downvotes - 1);
    }

    // Toggle upvote
    if (comment.upvoted_by.includes(userId)) {
      comment.upvoted_by.pull(userId);
      comment.upvotes = Math.max(0, comment.upvotes - 1);
    } else {
      comment.upvoted_by.push(userId);
      comment.upvotes += 1;
    }

    await video.save();

    res.status(200).json({
      success: true,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      upvoted: comment.upvoted_by.includes(userId),
      downvoted: comment.downvoted_by.includes(userId),
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const downvoteComment = async (req, res, next) => {
  try {
    const { videoId, commentId, videoType = 'long' } = req.body;
    const userId = req.user.id;

    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const comment = video.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Remove from upvotes if exists
    if (comment.upvoted_by.includes(userId)) {
      comment.upvoted_by.pull(userId);
      comment.upvotes = Math.max(0, comment.upvotes - 1);
    }

    // Toggle downvote
    if (comment.downvoted_by.includes(userId)) {
      comment.downvoted_by.pull(userId);
      comment.downvotes = Math.max(0, comment.downvotes - 1);
    } else {
      comment.downvoted_by.push(userId);
      comment.downvotes += 1;
    }

    await video.save();

    res.status(200).json({
      success: true,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      upvoted: comment.upvoted_by.includes(userId),
      downvoted: comment.downvoted_by.includes(userId),
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const GiftComment = async (req, res, next) => {
  try {
    const { videoId, videoType, commentId, amount, giftNote } = req.body
    const gifterId = req.user.id

    // Validation
    if (!videoId || !videoType || !commentId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Video ID, video type, comment ID, and amount are required',
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    if (!['long', 'short'].includes(videoType)) {
      return res.status(400).json({
        success: false,
        error: "Video type must be 'long' or 'short'",
        code: 'INVALID_VIDEO_TYPE',
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

    // Find the video
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo
    const video = await VideoModel.findById(videoId)

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }

    // Find the comment
    const comment = video.comments.id(commentId)
    if (!comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found',
        code: 'COMMENT_NOT_FOUND',
      })
    }

    if (comment.replies && comment.replies.length > 0) {
      const isTopLevelComment = video.comments.some(
        (c) => c._id.toString() === commentId
      )
      if (!isTopLevelComment) {
        return res.status(400).json({
          success: false,
          error: 'Cannot gift replies to comments, only original comments',
          code: 'CANNOT_GIFT_REPLIES',
        })
      }
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

    // Get wallets
    const gifterWallet = await getOrCreateWallet(gifterId, 'user')
    const receiverWallet = await getOrCreateWallet(commentAuthorId, 'user')

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

    // Get user details
    const receiver = await User.findById(commentAuthorId).select('username')
    if (!receiver) {
      return res.status(404).json({
        success: false,
        error: 'Comment author not found',
        code: 'COMMENT_AUTHOR_NOT_FOUND',
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
          content_type: videoType === 'long' ? 'LongVideo' : 'ShortVideo',
          description: `Gift for comment: ${comment.comment.substring(0, 50)}...`,
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
            comment_text: comment.comment.substring(0, 100),
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
          content_type: videoType === 'long' ? 'LongVideo' : 'ShortVideo',
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: receiver.username,
            comment_id: commentId,
            comment_text: comment.comment.substring(0, 100),
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
          content_type: videoType === 'long' ? 'LongVideo' : 'ShortVideo',
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: req.user.username,
            comment_id: commentId,
            comment_text: comment.comment.substring(0, 100),
            video_id: videoId,
            transfer_id: walletTransfer._id,
          },
        })

        await receiverTransaction.save({ session })
      })

      await session.endSession()

      res.status(200).json({
        success: true,
        message: 'Gift sent successfully!',
        gift: {
          amount: amount,
          from: req.user.username,
          to: receiver.username,
          videoTitle: video.name,
          commentPreview: comment.comment.substring(0, 100),
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

const GiftShortVideo = async (req, res, next) => {
  try {
    const { videoId, amount, giftNote } = req.body
    const gifterId = req.user.id

    // Validation
    if (!videoId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Video ID and amount are required',
        code: 'MISSING_REQUIRED_FIELDS',
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

    // Find the short video
    const video = await ShortVideo.findById(videoId).populate('created_by', 'username')
    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Short video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }

    const creatorId = video.created_by._id

    // Check if user is trying to gift themselves
    if (creatorId.toString() === gifterId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot gift yourself',
        code: 'CANNOT_GIFT_SELF',
      })
    }

    // Get wallets
    const gifterWallet = await getOrCreateWallet(gifterId, 'user')
    const creatorWallet = await getOrCreateWallet(creatorId, 'creator')

    // Check gifter's wallet balance
    if (gifterWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: gifterWallet.balance,
        requiredAmount: amount,
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    const session = await mongoose.startSession()

    try {
      await session.withTransaction(async () => {
        // Create wallet transfer
        const walletTransfer = new WalletTransfer({
          sender_id: gifterId,
          receiver_id: creatorId,
          sender_wallet_id: gifterWallet._id,
          receiver_wallet_id: creatorWallet._id,
          total_amount: amount,
          creator_amount: amount, // 100% to creator for gifts
          platform_amount: 0,
          currency: 'INR',
          transfer_type: 'short_video_gift',
          content_id: videoId,
          content_type: 'ShortVideo',
          description: `Gift for short video: ${video.name}`,
          sender_balance_before: gifterWallet.balance,
          sender_balance_after: gifterWallet.balance - amount,
          receiver_balance_before: creatorWallet.balance,
          receiver_balance_after: creatorWallet.balance + amount,
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: video.created_by.username,
            gift_note: giftNote || '',
          },
        })

        await walletTransfer.save({ session })

        // Update wallets
        gifterWallet.balance -= amount
        gifterWallet.total_spent += amount
        creatorWallet.balance += amount
        creatorWallet.total_received += amount

        await gifterWallet.save({ session })
        await creatorWallet.save({ session })

        // Create transactions
        const gifterTransaction = new WalletTransaction({
          wallet_id: gifterWallet._id,
          user_id: gifterId,
          transaction_type: 'debit',
          transaction_category: 'short_video_gift',
          amount: amount,
          currency: 'INR',
          description: `Gift sent to ${video.created_by.username} for short video "${video.name}"`,
          balance_before: gifterWallet.balance + amount,
          balance_after: gifterWallet.balance,
          content_id: videoId,
          content_type: 'ShortVideo',
          status: 'completed',
        })

        const creatorTransaction = new WalletTransaction({
          wallet_id: creatorWallet._id,
          user_id: creatorId,
          transaction_type: 'credit',
          transaction_category: 'gift_received',
          amount: amount,
          currency: 'INR',
          description: `Gift received from ${req.user.username} for short video "${video.name}"`,
          balance_before: creatorWallet.balance - amount,
          balance_after: creatorWallet.balance,
          content_id: videoId,
          content_type: 'ShortVideo',
          status: 'completed',
        })

        await gifterTransaction.save({ session })
        await creatorTransaction.save({ session })
      })

      res.status(200).json({
        success: true,
        message: 'Gift sent successfully!',
        gift: {
          amount: amount,
          from: req.user.username,
          to: video.created_by.username,
          videoTitle: video.name,
          giftNote: giftNote || '',
        },
      })

    } catch (transactionError) {
      await session.abortTransaction()
      throw transactionError
    } finally {
      await session.endSession()
    }

  } catch (error) {
    handleError(error, req, res, next)
  }
}

const saveVideo = async (req, res, next) => {
  try {
    const { videoId, videoType, seriesId } = req.body
    const userId = req.user.id
    
    if (!videoId || !videoType) {
      return res.status(400).json({ message: "Video ID and video type are required" })
    }
    
    if (!['long', 'series', 'short'].includes(videoType)) {
      return res.status(400).json({ message: "Video type must be 'long', 'series' or 'short'" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (videoType === 'series') {
      if (!seriesId) {
        return res.status(400).json({ message: "Series ID is required for series type" })
      }
      
      const series = await Series.findById(seriesId)
      if (!series) {
        return res.status(404).json({ message: "Series not found" })
      }
      
      if (user.saved_series.includes(seriesId)) {
        return res.status(400).json({ message: "Series already saved" })
      }
      
      user.saved_series.push(seriesId)
      await user.save()
      return res.status(200).json({ message: "Series saved successfully", seriesId })
    }
    
    if (videoType === 'long') {
      const video = await LongVideo.findById(videoId)
      if (!video) {
        return res.status(404).json({ message: 'Long video not found' })
      }
      
      if (user.saved_videos.includes(videoId)) {
        return res.status(400).json({ message: "Video already saved" })
      }
      
      user.saved_videos.push(videoId)
      await user.save()
      return res.status(200).json({ message: 'Video saved successfully', videoId })
    }
    
    if (videoType === 'short') {
      const video = await ShortVideo.findById(videoId)
      if (!video) {
        return res.status(404).json({ message: 'Short video not found' })
      }
      
      if (user.saved_short_videos.includes(videoId)) {
        return res.status(400).json({ message: "Short video already saved" })
      }
      
      user.saved_short_videos.push(videoId)
      await user.save()
      return res.status(200).json({ message: 'Short video saved successfully', videoId })
    }
    
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const checkForSaveVideo=async(req,res,next)=>{
  const { videoId, videoType, seriesId } = req.body
  const userId = req.user.id
  if (!videoId || !videoType) {
    return res.status(400).json({ message: "Video ID and video type are required" })
  }
  if (!['long', 'series', 'short'].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long', 'series' or 'short'" })
  }
  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    let isSaved = false
    if (videoType === 'series') {
      isSaved = user.saved_series.includes(seriesId)
    } else if (videoType === 'long') {
      isSaved = user.saved_videos.includes(videoId)
    } else if (videoType === 'short') {
      isSaved = user.saved_short_videos.includes(videoId)
    }
    res.status(200).json({ isSaved })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const ReplyToComment=async(req, res, next) => {
  const {videoId,commentId,reply,videoType}=req.body;
  const userId = req.user.id;
  if (!videoId || !commentId || !reply || !videoType) {
    return res.status(400).json({ message: 'Video ID, comment ID, reply, and video type are required' });
  }
  if (!['long', 'short'].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long' or 'short'" });
  }
  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    const comment = video.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    comment.replies.push({ user: userId, reply , replyTo: comment.user });
    await video.save();
    res.status(200).json({ message: 'Reply added successfully', repliesCount: comment.replies.length });
  } catch (error) {
    handleError(error, req, res, next);
}
}

const UpvoteReply=async (req, res, next) => {
  const { videoId, commentId, replyId, videoType } = req.body;
  const userId = req.user.id;
  if (!videoId || !commentId || !replyId || !videoType) {
    return res.status(400).json({ message: 'Video ID, comment ID, reply ID, and video type are required' });
  }
  if (!['long', 'short'].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long' or 'short'" });
  }
  try {
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    const comment = video.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    const reply = comment.replies.id(replyId);
    if (!reply) {
      return res.status(404).json({ message: 'Reply not found' });
    }
    if (reply.upvoted_by.includes(userId)) {
      reply.upvoted_by.pull(userId);
      reply.upvotes = Math.max(0, reply.upvotes - 1);
    } else {
      reply.upvoted_by.push(userId);
      reply.upvotes += 1;
    }
    await video.save();
    res.status(200).json({ message: 'Reply upvoted successfully', upvotes: reply.upvotes });
  } catch (error) {
    handleError(error, req, res, next);
  }
}

const DownvoteReply=async (req, res, next) => {
  const { videoId, commentId, replyId, videoType } = req.body;
  const userId = req.user.id;
  if (!videoId || !commentId || !replyId || !videoType) {
    return res.status(400).json({ message: 'Video ID, comment ID, reply ID, and video type are required' });
  }
  if (!['long', 'short'].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long' or 'short'" });
  }
  try { 
    const VideoModel = videoType === 'long' ? LongVideo : ShortVideo;
    const video = await VideoModel.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    const comment = video.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    const reply = comment.replies.id(replyId);
    if (!reply) {
      return res.status(404).json({ message: 'Reply not found' });
    }
    if (reply.downvoted_by.includes(userId)) {
      reply.downvoted_by.pull(userId);
      reply.downvotes = Math.max(0, reply.downvotes - 1);
    } else {
      reply.downvoted_by.push(userId);
      reply.downvotes += 1;
    }
    await video.save();
    res.status(200).json({ message: 'Reply downvoted successfully', downvotes: reply.downvotes });
  } catch (error) {
    handleError(error, req, res, next);
  }
}

const UnsaveVideo = async (req, res, next) => {
  const { videoId, videoType, seriesId } = req.body;
  const userId = req.user.id;

  if (!videoId || !videoType) {
    return res.status(400).json({ message: "Video ID and video type are required" });
  }

  if (!['long', 'series', 'short'].includes(videoType)) {
    return res.status(400).json({ message: "Video type must be 'long', 'series' or 'short'" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (videoType === 'series') {
      if (!seriesId) {
        return res.status(400).json({ message: "Series ID is required for series type" });
      }

      const wasPresent = user.saved_series.some(id => id.toString() === seriesId);
      if (!wasPresent) {
        return res.status(400).json({ message: "Series not found in saved list" });
      }

      user.saved_series = user.saved_series.filter(id => id.toString() !== seriesId);
      await user.save();
      return res.status(200).json({ message: "Series unsaved successfully", seriesId });
    }

    if (videoType === 'long') {
      const wasPresent = user.saved_videos.some(id => id.toString() === videoId);
      if (!wasPresent) {
        return res.status(400).json({ message: "Video not found in saved list" });
      }

      user.saved_videos = user.saved_videos.filter(id => id.toString() !== videoId);
      await user.save();
      return res.status(200).json({ message: 'Video unsaved successfully', videoId });
    }

    if (videoType === 'short') {
      const wasPresent = user.saved_short_videos.some(id => id.toString() === videoId);
      if (!wasPresent) {
        return res.status(400).json({ message: "Short video not found in saved list" });
      }

      user.saved_short_videos = user.saved_short_videos.filter(id => id.toString() !== videoId);
      await user.save();
      return res.status(200).json({ message: 'Short video unsaved successfully', videoId });
    }
  } catch (error) {
    handleError(error, req, res, next);
  }
};


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
  GiftShortVideo,
  getVideoComments,
  getCommentReplies,
  upvoteComment,
  downvoteComment,
  statusOfLike,
  saveVideo,
  getTotalSharesByVideoId
}
