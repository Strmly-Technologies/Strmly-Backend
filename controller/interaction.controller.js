const LongVideo = require('../models/LongVideo')
const ShortVideo = require('../models/ShortVideos')
const Wallet = require('../models/Wallet')
const WalletTransaction = require('../models/WalletTransaction')
const WalletTransfer = require('../models/WalletTransfer')
const User = require('../models/User')
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

const LikeVideo = async (req, res, next) => {
  const { videoId, videoType } = req.body
  const userId = req.user.id

  if (!videoId || !videoType) {
    return res
      .status(400)
      .json({ message: 'Video ID and video type are required' })
  }

  try {
    let video = await ShortVideo.findById(videoId)

    if (!video) {
      video = await LongVideo.findById(videoId)
    }

    if (!video) {
      return res.status(404).json({ message: 'Video not found' })
    }

    video.likes += 1
    await video.save()

    const user = await User.findById(userId)
    if (!user.liked_videos.includes(videoId)) {
      user.liked_videos.push(videoId)
      await user.save()
    }

    res.status(200).json({
      message: 'Video liked successfully',
      likes: video.likes,
    })
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
    if (!user.sharedVideos.includes(videoId)) {
      user.sharedVideos.push(videoId)
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

    video.comments.push({ user: userId, comment })
    await video.save()

    const user = await User.findById(userId)
    if (!Array.isArray(user.commented_videos)) {
      user.commented_videos = []
    }
    if (!user.commented_videos.map(id => id.toString()).includes(videoId.toString())) {
      user.commented_videos.push(videoId)
      await user.save()
    }

    res.status(200).json({
      message: 'Comment added successfully',
      comments: video.comments.length,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

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

module.exports = {
  LikeVideo,
  ShareVideo,
  CommentOnVideo,
  GiftComment,
}
