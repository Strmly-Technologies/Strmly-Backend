const mongoose = require('mongoose')
const LongVideo = require('../models/LongVideo')
const UserAccess = require('../models/UserAccess')
const Wallet = require('../models/Wallet')
const WalletTransaction = require('../models/WalletTransaction')
const WalletTransfer = require('../models/WalletTransfer')
const { handleError } = require('../utils/utils')
const User = require('../models/User')
/* const PLATFORM_FEE_PERCENTAGE = 30
const CREATOR_SHARE_PERCENTAGE = 70 */

const { checkCreatorPassAccess } = require('./creatorpass.controller')

const checkVideoAccess = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    // Get video details
    let video = await LongVideo.findById(id)
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('series', 'title price type')

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }

    // Check if user owns the video
    if (video.created_by._id.toString() === userId) {
      return res.status(200).json({
        success: true,
        hasAccess: true,
        accessType: 'owner',
        video: {
          id: video._id,
          title: video.name,
          description: video.description,
          creator: video.created_by.username,
          type: video.type || 'Free',
        },
        message: 'You have access as the video owner',
      })
    }

    // Check if video is free (all short videos are free, long videos check type)
    if (video.type === 'Free' && video.visibility === 'public') {
      return res.status(200).json({
        success: true,
        hasAccess: true,
        accessType: 'free',
        video: {
          id: video._id,
          title: video.name,
          description: video.description,
          creator: video.created_by.username,
          type: video.type || 'Free',
        },
        message: 'This video is free to watch',
      })
    }

    // Check creator pass
    const creatorPassCheck = await checkCreatorPassAccess(
      userId,
      video.created_by._id
    )
    if (creatorPassCheck.hasAccess) {
      return res.status(200).json({
        success: true,
        hasAccess: true,
        accessType: 'creator_pass',
        video: {
          id: video._id,
          title: video.name,
          description: video.description,
          creator: video.created_by.username,
          type: video.type,
        },
        creatorPass: {
          message: 'Free access with Creator Pass for this creator',
        },
      })
    }

    // Check if user has direct access to this video
    const directAccess = await UserAccess.findOne({
      user_id: userId,
      content_id: id,
      content_type: 'video',
    })

    if (directAccess) {
      return res.status(200).json({
        success: true,
        hasAccess: true,
        accessType: 'purchased',
        video: {
          id: video._id,
          title: video.name,
          description: video.description,
          creator: video.created_by.username,
          type: video.type,
        },
        purchaseInfo: {
          purchasedAt: directAccess.granted_at,
          paymentMethod: directAccess.payment_method,
        },
      })
    }

    // Check if user has series access (if video is part of a series)
    if (video.series) {
      const seriesAccess = await UserAccess.findOne({
        user_id: userId,
        content_id: video.series._id,
        content_type: 'series',
      })

      if (seriesAccess) {
        return res.status(200).json({
          success: true,
          hasAccess: true,
          accessType: 'series',
          video: {
            id: video._id,
            title: video.name,
            description: video.description,
            creator: video.created_by.username,
            type: video.type,
          },
          seriesInfo: {
            seriesTitle: video.series.title,
            purchasedAt: seriesAccess.granted_at,
          },
        })
      }
    }

    // No access - return payment options
    const paymentOptions = []

    // Individual video purchase option
    paymentOptions.push({
      type: 'individual',
      price: video.price || 99,
      description: `Buy this video for ₹${video.price || 99}`,
      endpoint: `/api/v1/videos/${id}/purchase`,
    })

    // Series purchase option (if video is part of a series)
    if (video.series && video.series.type === 'Paid') {
      paymentOptions.push({
        type: 'series',
        price: video.series.price,
        description: `Buy entire series "${video.series.title}" for ₹${video.series.price}`,
        endpoint: `/api/v1/wallet/transfer-series`,
        seriesId: video.series._id,
      })
    }

    // Creator Pass option
    const creator = await User.findById(video.created_by._id).select(
      'creator_profile'
    )
    const creatorPassPrice = creator?.creator_profile?.creator_pass_price || 199

    paymentOptions.push({
      type: 'creator_pass',
      price: creatorPassPrice,
      description: `Get unlimited access to all content by ${video.created_by.username} for ₹${creatorPassPrice}`,
      endpoint: '/api/v1/creator-pass/create-order',
      creatorId: video.created_by._id,
    })

    return res.status(200).json({
      success: true,
      hasAccess: false,
      accessType: 'none',
      video: {
        id: video._id,
        title: video.name,
        description: video.description,
        creator: video.created_by.username,
        type: video.type,
        price: video.price || 99,
      },
      paymentOptions,
      message: 'Payment required to watch this video',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const streamVideo = async (req, res, next) => {
  try {
    const { id } = req.params

    //const userId = req.user.id

    // First check access
    //const accessCheck = await checkVideoAccess(req, res, next)

    // If access check didn't return (meaning no access), don't proceed
    if (!res.headersSent) {
      return
    }

    // Get video with URL
    let video = await LongVideo.findById(id)

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      })
    }

    // Increment view count
    await LongVideo.findByIdAndUpdate(id, {
      $inc: { views: 1 },
    })

    res.status(200).json({
      success: true,
      message: 'Video stream access granted',
      streamData: {
        videoUrl: video.videoUrl,
        title: video.name,
        description: video.description,
        duration: video.duration,
        views: video.views + 1,
        thumbnailUrl: video.thumbnailUrl,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const purchaseIndividualVideo = async (req, res, next) => {
  try {
    const { id } = req.params

    const { amount, transferNote } = req.body
    const buyerId = req.user.id.toString()

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Amount is required',
        code: 'MISSING_AMOUNT',
      })
    }

    // Get video details
    let video = await LongVideo.findById(id).populate(
      'created_by',
      'username email'
    )

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

    const creatorId = video.created_by._id.toString()

    // Check if video is free
    if (video.type === 'Free') {
      return res.status(400).json({
        success: false,
        error: 'This video is free to watch',
        code: 'VIDEO_NOT_PAID',
      })
    }

    // Check if user already has access
    const existingAccess = await UserAccess.findOne({
      user_id: buyerId,
      content_id: id,
      content_type: 'video',
    })

    if (existingAccess) {
      return res.status(400).json({
        success: false,
        error: 'You already have access to this video',
        code: 'ALREADY_PURCHASED',
      })
    }

    // Check if user owns the video
    if (creatorId.toString() === buyerId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot buy your own video',
        code: 'CANNOT_BUY_OWN_VIDEO',
      })
    }

    // Check Creator Pass access
    const creatorPassCheck = await checkCreatorPassAccess(buyerId, creatorId)
    if (creatorPassCheck.hasAccess) {
      // Grant access directly
      const userAccess = new UserAccess({
        user_id: buyerId,
        content_id: id,
        content_type: 'video',
        access_type: 'creator_pass',
        payment_id: null,
        payment_method: 'creator_pass',
        payment_amount: 0,
        granted_at: new Date(),
        metadata: {
          creator_pass_id: creatorPassCheck.pass._id,
        },
      })

      await userAccess.save()

      return res.status(200).json({
        success: true,
        message: 'Access granted via Creator Pass!',
        accessType: 'creator_pass',
        video: {
          id: id,
          title: video.name,
        },
      })
    }

    if (amount < video.amount) {
      return res.status(400).json({
        success: false,
        error: 'Amount not valid',
        code: 'AMOUNT_NOT_VALID',
      })
    }

    // Process payment
    const buyerWallet = await Wallet.findOne({ user_id: buyerId })
    const creatorWallet = await Wallet.findOne({ user_id: creatorId })

    if (!buyerWallet || buyerWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        code: 'INSUFFICIENT_BALANCE',
        currentBalance: buyerWallet?.balance || 0,
        requiredAmount: amount,
      })
    }

    const session = await mongoose.startSession()

    try {
      await session.withTransaction(async () => {
        // Create wallet transfer
        const walletTransfer = new WalletTransfer({
          sender_id: buyerId,
          receiver_id: creatorId,
          sender_wallet_id: buyerWallet._id,
          receiver_wallet_id: creatorWallet._id,
          total_amount: amount,
          creator_amount: amount,

          currency: 'INR',
          transfer_type: 'video_purchase',
          content_id: id,
          content_type: 'video',
          description: `Purchased video: ${video.name}`,
          sender_balance_before: buyerWallet.balance,
          sender_balance_after: buyerWallet.balance - amount,
          receiver_balance_before: creatorWallet.balance,
          receiver_balance_after: creatorWallet.balance + amount,

          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: video.created_by.username,
            transfer_note: transferNote || '',
          },
        })

        await walletTransfer.save({ session })

        // Update wallets
        buyerWallet.balance -= amount
        buyerWallet.total_spent += amount
        creatorWallet.balance += amount
        creatorWallet.total_received += amount
        creatorWallet.revenue += amount
        await buyerWallet.save({ session })
        await creatorWallet.save({ session })

        // Create user access
        const userAccess = new UserAccess({
          user_id: buyerId,
          content_id: id,
          content_type: 'video',
          access_type: 'paid',
          payment_id: walletTransfer._id,
          payment_method: 'wallet_transfer',
          payment_amount: amount,
          granted_at: new Date(),
        })

        await userAccess.save({ session })

        // Create transactions
        const buyerTransaction = new WalletTransaction({
          wallet_id: buyerWallet._id,
          user_id: buyerId,
          transaction_type: 'debit',
          transaction_category: 'video_purchase',
          amount: amount,
          currency: 'INR',
          description: `Purchased video: ${video.name}`,
          balance_before: buyerWallet.balance + amount,
          balance_after: buyerWallet.balance,
          content_id: id,
          content_type: 'video',
          status: 'completed',
        })

        const creatorTransaction = new WalletTransaction({
          wallet_id: creatorWallet._id,
          user_id: creatorId,
          transaction_type: 'credit',
          transaction_category: 'creator_earning',
          amount: amount,
          currency: 'INR',
          description: `Earned from video: ${video.name}`,
          balance_before: creatorWallet.balance - amount,
          balance_after: creatorWallet.balance,
          content_id: id,
          content_type: 'video',
          status: 'completed',
        })

        await buyerTransaction.save({ session })
        await creatorTransaction.save({ session })
        video.earned_till_date += amount
        await video.save()
      })

      await session.endSession()

      res.status(200).json({
        success: true,
        message: 'Video purchased successfully!',
        purchase: {
          videoId: id,
          videoTitle: video.name,
          amount: amount,
          creatorAmount: amount,
        },
        access: {
          accessType: 'paid',
          grantedAt: new Date(),
        },
      })
    } catch (transactionError) {
      await session.abortTransaction()
      throw transactionError
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  checkVideoAccess,
  streamVideo,
  purchaseIndividualVideo,
}
