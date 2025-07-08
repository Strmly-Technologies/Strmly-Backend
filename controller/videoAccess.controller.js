const mongoose = require('mongoose');
const LongVideo = require('../models/LongVideo');
const ShortVideo = require('../models/ShortVideos');
const UserAccess = require('../models/UserAccess');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const WalletTransfer = require('../models/WalletTransfer');
const { handleError } = require('../utils/utils');

const PLATFORM_FEE_PERCENTAGE = 30;
const CREATOR_SHARE_PERCENTAGE = 70;

const checkVideoAccess = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const userId = req.user.id;

    if (!type || !['short', 'long'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Video type must be 'short' or 'long'",
        code: 'INVALID_VIDEO_TYPE',
      });
    }

    // Get video details
    let video;
    if (type === 'short') {
      video = await ShortVideo.findById(id)
        .populate('created_by', 'username email')
        .populate('community', 'name');
    } else {
      video = await LongVideo.findById(id)
        .populate('created_by', 'username email')
        .populate('community', 'name')
        .populate('series', 'title price type');
    }

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      });
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
      });
    }

    // Check if video is free
    if (type === 'short' || video.type === 'Free') {
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
      });
    }

 
    // Check creator pass
    const creatorPassAccess = await UserAccess.findOne({
      user_id: userId,
      content_id: video.created_by._id,
      content_type: 'creator',
      access_type: 'creator_pass',
    });
    if (creatorPassAccess) {
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
      });
    }

    // Check if user has direct access to this video
    const directAccess = await UserAccess.findOne({
      user_id: userId,
      content_id: id,
      content_type: 'video',
    });

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
      });
    }

    // Check if user has series access (if video is part of a series)
    if (video.series) {
      const seriesAccess = await UserAccess.findOne({
        user_id: userId,
        content_id: video.series._id,
        content_type: 'series',
      });

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
        });
      }
    }

    // No access - return payment options
    const paymentOptions = [];

    // Individual video purchase option
    paymentOptions.push({
      type: 'individual',
      price: video.price || 99, 
      description: `Buy this video for ₹${video.price || 99}`,
      endpoint: `/api/v1/videos/${id}/purchase`,
    });

    // Series purchase option (if video is part of a series)
    if (video.series && video.series.type === 'Paid') {
      paymentOptions.push({
        type: 'series',
        price: video.series.price,
        description: `Buy entire series "${video.series.title}" for ₹${video.series.price}`,
        endpoint: `/api/v1/wallet/transfer-series`,
        seriesId: video.series._id,
      });
    }

    // Strmly Pass option
    paymentOptions.push({
      type: 'strmly_pass',
      monthlyPrice: 250,
      yearlyPrice: 999,
      description: 'Get unlimited access to all content with Strmly Pass',
      endpoint: '/api/v1/strmly-pass/create-order',
    });

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
    });

  } catch (error) {
    handleError(error, req, res, next);
  }
};

const streamVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const userId = req.user.id;

    if (!type || !['short', 'long'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Video type must be 'short' or 'long'",
        code: 'INVALID_VIDEO_TYPE',
      });
    }

    // First check access
    const accessCheck = await checkVideoAccess(req, res, next);
    
    // If access check didn't return (meaning no access), don't proceed
    if (!res.headersSent) {
      return;
    }

    // Get video with URL
    let video;
    if (type === 'short') {
      video = await ShortVideo.findById(id);
    } else {
      video = await LongVideo.findById(id);
    }

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      });
    }

    // Increment view count
    await (type === 'short' ? ShortVideo : LongVideo).findByIdAndUpdate(
      id,
      { $inc: { views: 1 } }
    );

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
    });

  } catch (error) {
    handleError(error, req, res, next);
  }
};

const purchaseIndividualVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const { amount, transferNote } = req.body;
    const buyerId = req.user.id;

    if (!type || !['short', 'long'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Video type must be 'short' or 'long'",
        code: 'INVALID_VIDEO_TYPE',
      });
    }

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Amount is required',
        code: 'MISSING_AMOUNT',
      });
    }

    // Get video details
    let video;
    if (type === 'short') {
      video = await ShortVideo.findById(id).populate('created_by', 'username email');
    } else {
      video = await LongVideo.findById(id).populate('created_by', 'username email');
    }

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        code: 'VIDEO_NOT_FOUND',
      });
    }

    const creatorId = video.created_by._id;

    // Check if video is free
    if (type === 'short' || video.type === 'Free') {
      return res.status(400).json({
        success: false,
        error: 'This video is free to watch',
        code: 'VIDEO_NOT_PAID',
      });
    }

    // Check if user already has access
    const existingAccess = await UserAccess.findOne({
      user_id: buyerId,
      content_id: id,
      content_type: 'video',
    });

    if (existingAccess) {
      return res.status(400).json({
        success: false,
        error: 'You already have access to this video',
        code: 'ALREADY_PURCHASED',
      });
    }

    // Check if user owns the video
    if (creatorId.toString() === buyerId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot buy your own video',
        code: 'CANNOT_BUY_OWN_VIDEO',
      });
    }

    // Check Strmly Pass access
    const strmlyPassCheck = await checkStrmlyPassAccess(buyerId);
    if (strmlyPassCheck.hasAccess) {
      // Grant access directly
      const userAccess = new UserAccess({
        user_id: buyerId,
        content_id: id,
        content_type: 'video',
        access_type: 'strmly_pass',
        payment_id: null,
        payment_method: 'strmly_pass',
        payment_amount: 0,
        granted_at: new Date(),
        metadata: {
          strmly_pass_id: strmlyPassCheck.subscription._id,
        },
      });

      await userAccess.save();

      return res.status(200).json({
        success: true,
        message: 'Access granted via Strmly Pass!',
        accessType: 'strmly_pass',
        video: {
          id: id,
          title: video.name,
        },
      });
    }

    // Process payment
    const buyerWallet = await Wallet.findOne({ user_id: buyerId });
    const creatorWallet = await Wallet.findOne({ user_id: creatorId });

    if (!buyerWallet || buyerWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        code: 'INSUFFICIENT_BALANCE',
        currentBalance: buyerWallet?.balance || 0,
        requiredAmount: amount,
      });
    }

    const platformAmount = Math.round(amount * (PLATFORM_FEE_PERCENTAGE / 100));
    const creatorAmount = amount - platformAmount;

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // Create wallet transfer
        const walletTransfer = new WalletTransfer({
          sender_id: buyerId,
          receiver_id: creatorId,
          sender_wallet_id: buyerWallet._id,
          receiver_wallet_id: creatorWallet._id,
          total_amount: amount,
          creator_amount: creatorAmount,
          platform_amount: platformAmount,
          currency: 'INR',
          transfer_type: 'video_purchase',
          content_id: id,
          content_type: 'video',
          description: `Purchased video: ${video.name}`,
          sender_balance_before: buyerWallet.balance,
          sender_balance_after: buyerWallet.balance - amount,
          receiver_balance_before: creatorWallet.balance,
          receiver_balance_after: creatorWallet.balance + creatorAmount,
          platform_fee_percentage: PLATFORM_FEE_PERCENTAGE,
          creator_share_percentage: CREATOR_SHARE_PERCENTAGE,
          status: 'completed',
          metadata: {
            video_title: video.name,
            creator_name: video.created_by.username,
            transfer_note: transferNote || '',
            video_type: type,
          },
        });

        await walletTransfer.save({ session });

        // Update wallets
        buyerWallet.balance -= amount;
        buyerWallet.total_spent += amount;
        creatorWallet.balance += creatorAmount;
        creatorWallet.total_received += creatorAmount;

        await buyerWallet.save({ session });
        await creatorWallet.save({ session });

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
        });

        await userAccess.save({ session });

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
        });

        const creatorTransaction = new WalletTransaction({
          wallet_id: creatorWallet._id,
          user_id: creatorId,
          transaction_type: 'credit',
          transaction_category: 'creator_earning',
          amount: creatorAmount,
          currency: 'INR',
          description: `Earned from video: ${video.name}`,
          balance_before: creatorWallet.balance - creatorAmount,
          balance_after: creatorWallet.balance,
          content_id: id,
          content_type: 'video',
          status: 'completed',
        });

        await buyerTransaction.save({ session });
        await creatorTransaction.save({ session });
      });

      await session.endSession();

      res.status(200).json({
        success: true,
        message: 'Video purchased successfully!',
        purchase: {
          videoId: id,
          videoTitle: video.name,
          amount: amount,
          creatorAmount: creatorAmount,
          platformAmount: platformAmount,
        },
        access: {
          accessType: 'paid',
          grantedAt: new Date(),
        },
      });

    } catch (transactionError) {
      await session.abortTransaction();
      throw transactionError;
    }

  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = {
  checkVideoAccess,
  streamVideo,
  purchaseIndividualVideo,
};
