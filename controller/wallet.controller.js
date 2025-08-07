//const crypto = require('crypto')
const mongoose = require('mongoose')
//const razorpay = require('../config/razorpay')
const verifyGooglePurchase = require('../utils/google_play_payments')
const Wallet = require('../models/Wallet')
const WalletTransaction = require('../models/WalletTransaction')
const WalletTransfer = require('../models/WalletTransfer')
const UserAccess = require('../models/UserAccess')
const CommunityAccess = require('../models/CommunityAccess')
const Series = require('../models/Series')
const User = require('../models/User')
const Community = require('../models/Community')
const { handleError } = require('../utils/utils')
const { checkCreatorPassAccess } = require('./creatorpass.controller')

const MAX_WALLET_LOAD = 50000
const MIN_WALLET_LOAD = 0
/* const PLATFORM_FEE_PERCENTAGE = 30
const CREATOR_SHARE_PERCENTAGE = 70 */
const MAX_DESCRIPTION_LENGTH = 200
/* 
const generateShortReceipt = (prefix, userId) => {
  const shortUserId = userId.toString().slice(-8)
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.random().toString(36).substr(2, 4)
  return `${prefix}_${shortUserId}_${timestamp}_${random}`
} */

const validateAmount = (
  amount,
  min = MIN_WALLET_LOAD,
  max = MAX_WALLET_LOAD
) => {
  if (!amount || typeof amount !== 'number') {
    return {
      isValid: false,
      error: 'Amount is required and must be a number',
    }
  }
  if (amount < min) {
    return { isValid: false, error: `Minimum amount is ₹${min}` }
  }
  if (amount > max) {
    return { isValid: false, error: `Maximum amount is ₹${max}` }
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

const sanitizeString = (str, maxLength = 200) => {
  if (!str) return ''
  return str.toString().trim().substring(0, maxLength)
}

const getOrCreateWallet = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { walletType = 'user' } = req.body
    const validation = validateObjectId(userId, 'User ID')
    if (!validation.isValid) {
      throw new Error(validation.error)
    }

    let wallet = await Wallet.findOne({ user_id: userId })

    if (!wallet) {
      wallet = new Wallet({
        user_id: userId,
        balance: 100,
        currency: 'INR',
        wallet_type: walletType,
        status: 'active',
        total_loaded: 100,
      })
      await wallet.save()
    }
    res.status(200).json({
      success: true,
      message: {
        wallet_id: wallet._id.toString(),
        total_loaded: wallet.total_loaded,
        balance: wallet.balance,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const createWalletLoadOrder = async (req, res, next) => {
  try {
    const { amount } = req.body //send the original amount not after the 15%cut
    const userId = req.user.id.toString()

    const amountValidation = validateAmount(amount)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    const userValidation = validateObjectId(userId, 'User ID')
    if (!userValidation.isValid) {
      return res.status(400).json({
        error: userValidation.error,
        code: 'INVALID_USER_ID',
      })
    }

    const wallet = await Wallet.find({ user_id: userId })
    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found',
        code: 'WALLET_NOT_FOUND',
      })
    }

    if (wallet.status !== 'active') {
      return res.status(400).json({
        error: 'Wallet is not active. Please contact support.',
        code: 'WALLET_INACTIVE',
      })
    }
    /* 
    const orderOptions = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: generateShortReceipt('WL', userId),
      notes: {
        userId: userId,
        walletId: wallet._id.toString(),
        purpose: 'wallet_load',
        wallet_type: 'user',
      },
    }

    const razorpayOrder = await razorpay.orders.create(orderOptions) */

    /*     res.status(201).json({
      success: true,
      message: 'Wallet load order created successfully',
      order: {
        orderId: razorpayOrder.id,
        amount: amount,
        currency: 'INR',
        receipt: razorpayOrder.receipt,
      },
      wallet: {
        currentBalance: wallet.balance,
        balanceAfterLoad: wallet.balance + amount,
      },
      razorpayConfig: {
        key: process.env.RAZORPAY_KEY_ID,
        order_id: razorpayOrder.id,
        amount: Math.round(amount * 100),
        currency: 'INR',
        name: 'Strmly Wallet',
        description: `Load ₹${amount} to your Strmly wallet`,
        prefill: {
          name: req.user.username,
          email: req.user.email,
        },
      },
    }) */
    res.status(201).json({
      success: true,
      message: 'Wallet load order created successfully',
      wallet: {
        currentBalance: wallet.balance,
        balanceAfterLoad: wallet.balance + amount,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const verifyWalletLoad = async (req, res, next) => {
  try {
    const {
      google_purchase_token,
      google_product_id,
      google_order_id,
      amount, //send the original amount not after the 15%cut
    } = req.body

    const userId = req.user.id.toString()

    if (!google_purchase_token || !google_product_id || !google_order_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification fields',
        code: 'MISSING_PAYMENT_FIELDS',
      })
    }
    const amountValidation = validateAmount(amount)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }
    /*     if (
      typeof razorpay_order_id !== 'string' ||
      !razorpay_order_id.startsWith('order_')
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
        code: 'INVALID_ORDER_ID',
      })
    } */

    /*     if (
      typeof razorpay_payment_id !== 'string' ||
      !razorpay_payment_id.startsWith('pay_')
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment ID format',
        code: 'INVALID_PAYMENT_ID',
      })
    } */

    /*     const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex')

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed. Invalid signature.',
        code: 'SIGNATURE_VERIFICATION_FAILED',
      })
    }
 */
    const existingTransaction = await WalletTransaction.findOne({
      google_order_id: google_order_id,
      user_id: userId,
    })

    if (existingTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Payment already processed',
        code: 'PAYMENT_ALREADY_PROCESSED',
      })
    }

    let payment

    payment = await verifyGooglePurchase(
      google_product_id,
      google_purchase_token
    )

    if (!payment.valid) {
      console.log(payment)
      return res.status(400).json({
        success: false,
        error: 'Payment not captured successfully',
        code: 'PAYMENT_NOT_CAPTURED',
      })
    }

    const wallet = await Wallet.find({ user_id: userId })
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'wallet not found',
        code: 'WALLET_NOT _FOUND',
      })
    }
    const balanceBefore = wallet.balance
    const balanceAfter = balanceBefore + amount

    const session = await mongoose.startSession()
    let walletTransaction

    try {
      await session.withTransaction(async () => {
        walletTransaction = new WalletTransaction({
          wallet_id: wallet._id,
          user_id: userId,
          transaction_type: 'credit',
          transaction_category: 'wallet_load',
          amount: amount,
          currency: 'INR',
          description: `Loaded ₹${amount} from bank to wallet`,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          google_product_id: google_product_id,
          google_order_id: google_order_id,
          status: 'completed',
        })

        await walletTransaction.save({ session })

        wallet.balance = balanceAfter
        wallet.total_loaded += amount
        wallet.loaded += amount
        wallet.last_transaction_at = new Date()
        await wallet.save({ session })
      })

      await session.endSession()

      res.status(200).json({
        success: true,
        message: 'Wallet loaded successfully!',
        transaction: {
          id: walletTransaction._id,
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          date: new Date(),
          source: 'bank_transfer',
        },
        wallet: {
          balance: wallet.balance,
          totalLoaded: wallet.total_loaded,
        },
        nextSteps: {
          message:
            'You can now transfer money to creators to buy their content',
          availableActions: [
            'Buy series from creators',
            'Purchase individual videos',
            'Send tips to creators',
          ],
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

const transferToCreatorForSeries = async (req, res, next) => {
  try {
    const { seriesId, amount, transferNote } = req.body
    const buyerId = req.user.id.toString()

    if (!seriesId) {
      return res.status(400).json({
        success: false,
        error: 'Series ID is required',
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    const seriesValidation = validateObjectId(seriesId, 'Series ID')
    if (!seriesValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: seriesValidation.error,
        code: 'INVALID_SERIES_ID',
      })
    }

    const series = await Series.findById(seriesId).populate(
      'created_by',
      'username email'
    )
    if (!series) {
      return res.status(404).json({
        success: false,
        error: 'Series not found',
        code: 'SERIES_NOT_FOUND',
      })
    }
    const shouldUnlockFunds =
      series.episodes.length >= series.promised_episode_count ? true : false
    const creatorId = series.created_by._id.toString()

    if (series.type !== 'Paid') {
      return res.status(400).json({
        success: false,
        error: 'This series is free to watch',
        code: 'SERIES_NOT_PAID',
      })
    }
    const seriesAmount = series.price
    if (Number(seriesAmount) !== Number(amount)) {
      // if user amount and series amount are not same
      return res.status(400).json({
        success: false,
        error: 'Series price does not match the provided amount',
        code: 'SERIES_PRICE_MISMATCH',
      })
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Series price is not set or invalid',
        code: 'INVALID_SERIES_PRICE',
      })
    }

    const amountValidation = validateAmount(amount, 1, 10000)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    const sanitizedNote = sanitizeString(transferNote, MAX_DESCRIPTION_LENGTH)
    if (transferNote && transferNote.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Transfer note must be less than ${MAX_DESCRIPTION_LENGTH} characters`,
        code: 'INVALID_TRANSFER_NOTE',
      })
    }

    const existingAccess = await UserAccess.findOne({
      user_id: buyerId,
      content_id: seriesId,
      content_type: 'Series',
    })

    if (existingAccess) {
      return res.status(400).json({
        success: false,
        error: 'You already have access to this series',
        code: 'ALREADY_PURCHASED',
      })
    }

    if (creatorId.toString() === buyerId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot buy your own series',
        code: 'CANNOT_BUY_OWN_SERIES',
      })
    }

    const buyerWallet = await Wallet.find({ user_id: buyerId })
    if (!buyerWallet) {
      return res.status(404).json({
        success: false,
        error: 'buyer wallet not found',
        code: 'BUYER_WALLET_NOT _FOUND',
      })
    }
    const creatorWallet = await Wallet.find({ user_id: creatorId })
    if (!creatorWallet) {
      return res.status(404).json({
        success: false,
        error: 'creator wallet not found',
        code: 'CREATOR_WALLET_NOT _FOUND',
      })
    }

    if (buyerWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Your wallet is not active',
        code: 'WALLET_INACTIVE',
      })
    }

    if (buyerWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: buyerWallet.balance,
        requiredAmount: amount,
        shortfall: amount - buyerWallet.balance,
        suggestion: 'Please load more money to your wallet',
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    if (creatorWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: "Creator's wallet is not active",
        code: 'CREATOR_WALLET_INACTIVE',
      })
    }

    // Check if user has active Creator Pass for this creator
    const creatorPassCheck = await checkCreatorPassAccess(buyerId, creatorId)
    if (creatorPassCheck.hasAccess) {
      // Grant access directly without payment
      const userAccess = new UserAccess({
        user_id: buyerId,
        content_id: seriesId,
        content_type: 'series',
        access_type: 'creator_pass',
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
        series: {
          id: seriesId,
          title: series.title,
          price: series.price,
        },
        creatorPass: {
          message: 'This content is free with your Creator Pass',
          creatorName: series.created_by.username,
        },
        nextSteps: {
          message: 'You can now watch all episodes of this series',
          seriesId: seriesId,
        },
      })
    }

    const buyerBalanceBefore = buyerWallet.balance
    const creatorBalanceBefore = creatorWallet.balance
    const lockedEarnings = series.locked_earnings

    if (!shouldUnlockFunds) {
      const session = await mongoose.startSession()
      try {
        await session.withTransaction(async () => {
          const buyerBalanceAfter = buyerBalanceBefore - amount
          buyerWallet.balance = buyerBalanceAfter
          buyerWallet.total_spent += amount
          buyerWallet.last_transaction_at = new Date()
          await buyerWallet.save({ session })
          series.locked_earnings += amount
          series.earned_till_date += amount
          await series.save({ session })
          const buyerTransaction = new WalletTransaction({
            wallet_id: buyerWallet._id,
            user_id: buyerId,
            transaction_type: 'debit',
            transaction_category: 'series_purchase',
            amount: amount,
            currency: 'INR',
            description: `Purchased series: ${series.title} (Total: ₹${amount})`,
            balance_before: buyerBalanceBefore,
            balance_after: buyerBalanceAfter,
            content_id: seriesId,
            content_type: 'series',
            status: 'completed',
            metadata: {
              series_title: series.title,
              creator_name: series.created_by.username,
              platform_fee: amount,
              creator_share: amount,
            },
          })

          await buyerTransaction.save({ session })

          const userAccess = new UserAccess({
            user_id: buyerId,
            content_id: seriesId,
            content_type: 'series',
            access_type: 'paid',
            payment_method: 'wallet_transfer',
            payment_amount: amount,
            granted_at: new Date(),
          })

          await userAccess.save({ session })
        })
        await session.endSession()
        return res.status(200).json({
          success: true,
          message: `Series purchased successfully for ₹${amount}!`,
          transfer: {
            totalAmount: amount,
            seriesPrice: series.price,
            creatorAmount: amount,
            from: req.user.username,
            to: series.created_by.username,
            series: series.title,
            transferType: 'series_purchase',
          },
          buyer: {
            balanceBefore: buyerBalanceBefore,
            balanceAfter: buyerWallet.balance,
            currentBalance: buyerWallet.balance,
          },
          creator: {
            lockedBalanceBefore: lockedEarnings,
            lockedBalanceAfter: series.locked_earnings,
          },

          access: {
            contentId: seriesId,
            contentType: 'Series',
            accessType: 'paid',
            grantedAt: new Date(),
          },
          nextSteps: {
            message: 'You can now watch all episodes of this series',
            seriesId: seriesId,
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
    }

    const session = await mongoose.startSession()

    try {
      const creatorAmount =
        lockedEarnings > 0 ? amount + lockedEarnings : amount
      await session.withTransaction(async () => {
        const buyerBalanceAfter = buyerBalanceBefore - amount

        const creatorBalanceAfter = creatorBalanceBefore + creatorAmount

        const walletTransfer = new WalletTransfer({
          sender_id: buyerId,
          receiver_id: creatorId,
          sender_wallet_id: buyerWallet._id,
          receiver_wallet_id: creatorWallet._id,
          total_amount: creatorAmount,
          creator_amount: creatorAmount,
          currency: 'INR',
          transfer_type: 'series_purchase',
          content_id: seriesId,
          content_type: 'series',
          description: `Purchased series: ${series.title}`,
          sender_balance_before: buyerBalanceBefore,
          sender_balance_after: buyerBalanceAfter,
          receiver_balance_before: creatorBalanceBefore,
          receiver_balance_after: creatorBalanceAfter,
          status: 'completed',
          metadata: {
            series_title: series.title,
            creator_name: series.created_by.username,
            transfer_note: sanitizedNote,
            commission_calculation: {
              total_amount: creatorAmount,
            },
          },
        })

        await walletTransfer.save({ session })

        buyerWallet.balance = buyerBalanceAfter
        buyerWallet.total_spent += amount
        buyerWallet.last_transaction_at = new Date()
        await buyerWallet.save({ session })

        creatorWallet.balance = creatorBalanceAfter
        creatorWallet.total_received += creatorAmount
        creatorWallet.revenue += creatorAmount
        creatorWallet.last_transaction_at = new Date()
        await creatorWallet.save({ session })
        series.earned_till_date += amount
        if (lockedEarnings > 0) {
          series.locked_earnings = 0
        }
        await series.save({ session })
        const buyerTransaction = new WalletTransaction({
          wallet_id: buyerWallet._id,
          user_id: buyerId,
          transaction_type: 'debit',
          transaction_category: 'series_purchase',
          amount: amount,
          currency: 'INR',
          description: `Purchased series: ${series.title} (Total: ₹${amount})`,
          balance_before: buyerBalanceBefore,
          balance_after: buyerBalanceAfter,
          content_id: seriesId,
          content_type: 'series',
          status: 'completed',
          metadata: {
            series_title: series.title,
            creator_name: series.created_by.username,
            transfer_id: walletTransfer._id,
          },
        })

        await buyerTransaction.save({ session })

        const creatorTransaction = new WalletTransaction({
          wallet_id: creatorWallet._id,
          user_id: creatorId,
          transaction_type: 'credit',
          transaction_category: 'creator_earning',
          amount: creatorAmount,
          currency: 'INR',
          description: `Received share for series: ${series.title} (₹${creatorAmount}`,
          balance_before: creatorBalanceBefore,
          balance_after: creatorBalanceAfter,
          content_id: seriesId,
          content_type: 'Series',
          status: 'completed',
          metadata: {
            series_title: series.title,
            buyer_name: req.user.username,
            transfer_id: walletTransfer._id,
            total_amount: creatorAmount,
          },
        })

        await creatorTransaction.save({ session })

        const userAccess = new UserAccess({
          user_id: buyerId,
          content_id: seriesId,
          content_type: 'series',
          access_type: 'paid',
          payment_id: walletTransfer._id,
          payment_method: 'wallet_transfer',
          payment_amount: amount,
          granted_at: new Date(),
        })

        await userAccess.save({ session })

        await User.findByIdAndUpdate(
          creatorId,
          {
            $inc: {
              'creator_profile.total_earned': creatorAmount,
            },
          },
          { session }
        )

        await Series.findByIdAndUpdate(
          seriesId,
          {
            $inc: {
              total_earned: creatorAmount,
              total_revenue: creatorAmount,
              total_purchases: 1,
              'analytics.total_revenue': creatorAmount,
            },
            $set: {
              'analytics.last_analytics_update': new Date(),
            },
          },
          { session }
        )
      })

      await session.endSession()

      res.status(200).json({
        success: true,
        message: `Series purchased successfully for ₹${amount}!`,
        transfer: {
          totalAmount: creatorAmount,
          seriesPrice: series.price,
          creatorAmount: creatorAmount,

          from: req.user.username,
          to: series.created_by.username,
          series: series.title,
          transferType: 'series_purchase',
        },
        buyer: {
          balanceBefore: buyerBalanceBefore,
          balanceAfter: buyerWallet.balance,
          currentBalance: buyerWallet.balance,
        },
        creator: {
          balanceBefore: creatorBalanceBefore,
          balanceAfter: creatorWallet.balance,
          currentBalance: creatorWallet.balance,
          earnedAmount: creatorAmount,
        },

        access: {
          contentId: seriesId,
          contentType: 'Series',
          accessType: 'paid',
          grantedAt: new Date(),
        },
        nextSteps: {
          message: 'You can now watch all episodes of this series',
          seriesId: seriesId,
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

const transferCommunityFee = async (req, res, next) => {
  try {
    const { communityId, amount, feeNote } = req.body
    const creatorId = req.user.id.toString()

    if (!communityId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Community ID and amount are required',
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    const communityValidation = validateObjectId(communityId, 'Community ID')
    if (!communityValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: communityValidation.error,
        code: 'INVALID_COMMUNITY_ID',
      })
    }

    const amountValidation = validateAmount(amount, 1, 5000)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    const sanitizedNote = sanitizeString(feeNote, MAX_DESCRIPTION_LENGTH)

    // Find the community
    const community = await Community.findById(communityId).populate(
      'founder',
      'username email'
    )
    if (!community) {
      return res.status(404).json({
        success: false,
        error: 'Community not found',
        code: 'COMMUNITY_NOT_FOUND',
      })
    }

    const founderId = community.founder._id.toString()

    // Check if community has upload fee
    if (community.community_fee_type !== 'paid') {
      return res.status(400).json({
        success: false,
        error: "This community doesn't require upload fee",
        code: 'COMMUNITY_FREE_UPLOAD',
      })
    }

    // Check if creator already has access
    const existingAccess = await CommunityAccess.findOne({
      user_id: creatorId,
      community_id: communityId,
    })

    if (existingAccess) {
      // Check if access is expired
      if (existingAccess.isExpired()) {
        // Renew expired access
        await existingAccess.renewSubscription()

        return res.status(200).json({
          success: true,
          message: 'Community access renewed successfully!',
          access: {
            communityId: communityId,
            accessType: 'paid',
            status: 'renewed',
            expiresAt: existingAccess.expires_at,
            uploadPermission: true,
          },
          nextSteps: {
            message: 'You can continue uploading videos to this community',
            communityId: communityId,
          },
        })
      } else if (existingAccess.status === 'active') {
        return res.status(400).json({
          success: false,
          error: 'You already have active upload access to this community',
          code: 'ALREADY_HAS_ACCESS',
          currentAccess: {
            expiresAt: existingAccess.expires_at,
            daysRemaining: Math.ceil(
              (existingAccess.expires_at - new Date()) / (1000 * 60 * 60 * 24)
            ),
          },
        })
      }
    }

    // Check if creator is trying to pay themselves
    if (founderId.toString() === creatorId) {
      return res.status(400).json({
        success: false,
        error: "Community founder doesn't need to pay upload fee",
        code: 'FOUNDER_EXEMPT_FROM_FEE',
      })
    }

    // Get wallets
    const creatorWallet = await Wallet.find({ user_id: creatorId })
    if (!creatorWallet) {
      return res.status(404).json({
        success: false,
        error: 'creator wallet not found',
        code: 'CREATOR_WALLET_NOT _FOUND',
      })
    }
    const founderWallet = await Wallet.find({ user_id: founderId })
    if (!founderWallet) {
      return res.status(404).json({
        success: false,
        error: 'founder wallet not found',
        code: 'FOUNDER_WALLET_NOT _FOUND',
      })
    }

    // Check creator's wallet balance
    if (creatorWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: creatorWallet.balance,
        requiredAmount: amount,
        shortfall: amount - creatorWallet.balance,
        suggestion: 'Please load more money to your wallet',
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    // Check wallet statuses
    if (creatorWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Your wallet is not active',
        code: 'WALLET_INACTIVE',
      })
    }

    if (founderWallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: "Community founder's wallet is not active",
        code: 'FOUNDER_WALLET_INACTIVE',
      })
    }

    // Calculate revenue sharing (currently 100% to founder, 0% to platform)
    const founderAmount = Math.round(
      amount * (community.revenue_sharing.founder_percentage / 100)
    )
    const platformAmount = amount - founderAmount

    const session = await mongoose.startSession()

    const creatorBalanceBefore = creatorWallet.balance
    const founderBalanceBefore = founderWallet.balance

    try {
      await session.withTransaction(async () => {
        const creatorBalanceAfter = creatorBalanceBefore - amount
        const founderBalanceAfter = founderBalanceBefore + founderAmount

        // Create wallet transfer record
        const walletTransfer = new WalletTransfer({
          sender_id: creatorId,
          receiver_id: founderId,
          sender_wallet_id: creatorWallet._id,
          receiver_wallet_id: founderWallet._id,
          total_amount: amount,
          creator_amount: founderAmount,
          platform_amount: platformAmount,
          currency: 'INR',
          transfer_type: 'community_fee',
          content_id: communityId,
          content_type: 'Community',
          description: `Community upload fee for: ${community.name}`,
          sender_balance_before: creatorBalanceBefore,
          sender_balance_after: creatorBalanceAfter,
          receiver_balance_before: founderBalanceBefore,
          receiver_balance_after: founderBalanceAfter,
          platform_fee_percentage:
            community.revenue_sharing.platform_percentage,
          creator_share_percentage:
            community.revenue_sharing.founder_percentage,
          status: 'completed',
          metadata: {
            community_name: community.name,
            founder_name: community.founder.username,
            transfer_note: sanitizedNote,
            fee_type: 'community_upload_fee',
            revenue_split: {
              founder_share: founderAmount,
              platform_share: platformAmount,
            },
          },
        })

        await walletTransfer.save({ session })

        // Update creator wallet
        creatorWallet.balance = creatorBalanceAfter
        creatorWallet.total_spent += amount
        creatorWallet.last_transaction_at = new Date()
        await creatorWallet.save({ session })

        // Update founder wallet
        founderWallet.balance = founderBalanceAfter
        founderWallet.total_received += founderAmount
        founderWallet.revenue += founderAmount
        founderWallet.last_transaction_at = new Date()
        await founderWallet.save({ session })

        // Create creator transaction
        const creatorTransaction = new WalletTransaction({
          wallet_id: creatorWallet._id,
          user_id: creatorId,
          transaction_type: 'debit',
          transaction_category: 'community_fee',
          amount: amount,
          currency: 'INR',
          description: `Community upload fee for "${community.name}" (₹${amount})`,
          balance_before: creatorBalanceBefore,
          balance_after: creatorBalanceAfter,
          content_id: communityId,
          content_type: 'Community',
          status: 'completed',
          metadata: {
            community_name: community.name,
            founder_name: community.founder.username,
            transfer_id: walletTransfer._id,
            founder_share: founderAmount,
            platform_share: platformAmount,
          },
        })

        await creatorTransaction.save({ session })

        // Create founder transaction
        const founderTransaction = new WalletTransaction({
          wallet_id: founderWallet._id,
          user_id: founderId,
          transaction_type: 'credit',
          transaction_category: 'community_fee_received',
          amount: founderAmount,
          currency: 'INR',
          description: `Community upload fee from ${req.user.username} for "${community.name}" (₹${founderAmount} of ₹${amount})`,
          balance_before: founderBalanceBefore,
          balance_after: founderBalanceAfter,
          content_id: communityId,
          content_type: 'Community',
          status: 'completed',
          metadata: {
            community_name: community.name,
            creator_name: req.user.username,
            transfer_id: walletTransfer._id,
            total_fee_paid: amount,
            founder_share: founderAmount,
            platform_share: platformAmount,
          },
        })

        await founderTransaction.save({ session })

        // Create community access record with 30-day expiry
        const accessExpiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

        const communityAccess = new CommunityAccess({
          user_id: creatorId,
          community_id: communityId,
          access_type: 'paid',
          payment_id: walletTransfer._id,
          payment_amount: amount,
          payment_date: new Date(),
          expires_at: accessExpiryDate,
          subscription_status: 'active',
          status: 'active',
          granted_at: new Date(),
        })

        await communityAccess.save({ session })

        // Update community statistics
        await Community.findByIdAndUpdate(
          communityId,
          {
            $inc: {
              total_fee_collected: founderAmount,
              total_uploads: 1,
              'analytics.total_revenue': amount,
            },
            $set: {
              'analytics.last_analytics_update': new Date(),
            },
          },
          { session }
        )

        // Update user earnings
        await User.findByIdAndUpdate(
          founderId,
          {
            $inc: {
              'creator_profile.total_earned': founderAmount,
            },
          },
          { session }
        )
      })

      await session.endSession()

      res.status(200).json({
        success: true,
        message: 'Community monthly subscription activated successfully!',
        transfer: {
          totalAmount: amount,
          founderAmount: founderAmount,
          platformAmount: platformAmount,
          revenueShare: `Founder: ${community.revenue_sharing.founder_percentage}%, Platform: ${community.revenue_sharing.platform_percentage}%`,
          from: req.user.username,
          to: community.founder.username,
          community: community.name,
          transferType: 'community_fee',
        },
        creator: {
          balanceBefore: creatorBalanceBefore,
          balanceAfter: creatorWallet.balance,
          currentBalance: creatorWallet.balance,
        },
        founder: {
          balanceBefore: founderBalanceBefore,
          balanceAfter: founderWallet.balance,
          currentBalance: founderWallet.balance,
          earnedAmount: founderAmount,
        },
        community: {
          name: community.name,
          feeAmount: community.community_fee_amount,
          totalCollected: community.total_fee_collected + founderAmount,
          totalUploads: community.total_uploads + 1,
        },
        access: {
          communityId: communityId,
          accessType: 'paid',
          uploadPermission: true,
          subscriptionType: 'monthly',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          daysRemaining: 30,
          grantedAt: new Date(),
        },
        nextSteps: {
          message: 'You can now upload videos to this community for 30 days',
          communityId: communityId,
          renewalInfo:
            'Your subscription will need to be renewed after 30 days',
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

const getWalletDetails = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()

    const userValidation = validateObjectId(userId, 'User ID')
    if (!userValidation.isValid) {
      return res.status(400).json({
        error: userValidation.error,
        code: 'INVALID_USER_ID',
      })
    }

    const wallet = await Wallet.find({ user_id: userId })
    if (!wallet) {
      return res.status(404).json({
        error: 'wallet not found',
        code: 'WALLET_NOT_FOUND',
      })
    }
    const recentTransfers = await WalletTransfer.find({
      $or: [{ sender_id: userId }, { receiver_id: userId }],
    })
      .populate('sender_id', 'username')
      .populate('receiver_id', 'username')
      .populate('content_id', 'title name')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()

    const recentTransactions = await WalletTransaction.find({
      user_id: userId,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select(
        'transaction_type transaction_category amount description balance_after createdAt status'
      )
      .lean()

    res.status(200).json({
      success: true,
      message: 'Wallet details retrieved successfully',
      wallet: {
        id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        type: wallet.wallet_type,
        status: wallet.status,
        totalLoaded: wallet.total_loaded,
        totalSpent: wallet.total_spent,
        totalReceived: wallet.total_received,
        lastTransactionAt: wallet.last_transaction_at,
      },
      recentTransfers: recentTransfers.map((transfer) => ({
        id: transfer._id,
        type:
          transfer.sender_id._id.toString() === userId ? 'sent' : 'received',
        totalAmount: transfer.total_amount,
        creatorAmount: transfer.creator_amount,
        platformAmount: transfer.platform_amount,
        from: transfer.sender_id.username,
        to: transfer.receiver_id.username,
        purpose: transfer.transfer_type,
        contentTitle: transfer.content_id?.title || transfer.content_id?.name,
        description: transfer.description,
        date: transfer.createdAt,
        status: transfer.status,
      })),
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx._id,
        type: tx.transaction_type,
        category: tx.transaction_category,
        amount: tx.amount,
        description: tx.description,
        balanceAfter: tx.balance_after,
        date: tx.createdAt,
        status: tx.status,
      })),
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getWalletTransactionHistory = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const {
      page = 1,
      limit = 20,
      type,
      category,
      timePeriod = '7d',
    } = req.query

    const userValidation = validateObjectId(userId, 'User ID')
    if (!userValidation.isValid) {
      return res.status(400).json({
        error: userValidation.error,
        code: 'INVALID_USER_ID',
      })
    }

    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)

    if (pageNum < 1 || pageNum > 1000) {
      return res.status(400).json({
        error: 'Page number must be between 1 and 1000',
        code: 'INVALID_PAGE_NUMBER',
      })
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Limit must be between 1 and 100',
        code: 'INVALID_LIMIT',
      })
    }

    const filter = { user_id: userId }

    if (type) {
      if (!['credit', 'debit'].includes(type)) {
        return res.status(400).json({
          error: "Transaction type must be 'credit' or 'debit'",
          code: 'INVALID_TRANSACTION_TYPE',
        })
      }
      filter.transaction_type = type
    }

    if (category) {
      const validCategories = [
        'wallet_load',
        'series_purchase',
        'video_purchase',
        'video_gift',
        'creator_pass_purchase',
        'creator_earning',
        'platform_commission',
        'withdrawal_request',
        'refund',
        'comment_gift',
        'gift_received',
        'community_fee',
        'community_subscription',
        'community_fee_received',
      ]
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: `Transaction category must be one of: ${validCategories.join(', ')}`,
          code: 'INVALID_TRANSACTION_CATEGORY',
        })
      }
      filter.transaction_category = category
    }

    const now = new Date()
    let startDate

    switch (timePeriod) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '15d':
        startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '3m':
        startDate = new Date(new Date(now).setMonth(now.getMonth() - 3))
        break
      case '6m':
        startDate = new Date(new Date(now).setMonth(now.getMonth() - 6))
        break
      case '1y':
        startDate = new Date(new Date(now).setFullYear(now.getFullYear() - 1))
        break
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid time period',
          code: 'INVALID_TIME_PERIOD',
        })
    }
    filter.createdAt = { $gte: startDate }

    const transactions = await WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .populate('content_id', 'title name')
      .select('-__v')
      .lean()

    const total = await WalletTransaction.countDocuments(filter)

    res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully',
      transactions: transactions.map((tx) => ({
        id: tx._id,
        type: tx.transaction_type,
        category: tx.transaction_category,
        amount: tx.amount,
        description: tx.description,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        status: tx.status,
        date: tx.createdAt,
        contentTitle: tx.content_id?.title || tx.content_id?.name,
        metadata: tx.metadata,
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalTransactions: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
        itemsPerPage: limitNum,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getGiftHistory = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { page = 1, limit = 20, type = 'all', timePeriod = '7d' } = req.query

    const userValidation = validateObjectId(userId, 'User ID')
    if (!userValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: userValidation.error,
        code: 'INVALID_USER_ID',
      })
    }

    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)

    if (pageNum < 1 || pageNum > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Page number must be between 1 and 1000',
        code: 'INVALID_PAGE_NUMBER',
      })
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100',
        code: 'INVALID_LIMIT',
      })
    }

    let filter = {}

    if (type === 'sent') {
      filter = { sender_id: userId, transfer_type: 'comment_gift' }
    } else if (type === 'received') {
      filter = { receiver_id: userId, transfer_type: 'comment_gift' }
    } else if (type === 'all') {
      filter = {
        $or: [
          { sender_id: userId, transfer_type: 'comment_gift' },
          { receiver_id: userId, transfer_type: 'comment_gift' },
        ],
      }
    } else {
      return res.status(400).json({
        success: false,
        error: "Type must be 'sent', 'received', or 'all'",
        code: 'INVALID_TYPE',
      })
    }

    const now = new Date()
    let startDate

    switch (timePeriod) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '15d':
        startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '3m':
        startDate = new Date(new Date(now).setMonth(now.getMonth() - 3))
        break
      case '6m':
        startDate = new Date(new Date(now).setMonth(now.getMonth() - 6))
        break
      case '1y':
        startDate = new Date(new Date(now).setFullYear(now.getFullYear() - 1))
        break
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid time period',
          code: 'INVALID_TIME_PERIOD',
        })
    }
    filter.createdAt = { $gte: startDate }

    const gifts = await WalletTransfer.find(filter)
      .populate('sender_id', 'username profilePicture')
      .populate('receiver_id', 'username profilePicture')
      .populate('content_id', 'name title')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean()

    const total = await WalletTransfer.countDocuments(filter)

    res.status(200).json({
      success: true,
      message: 'Gift history retrieved successfully',
      gifts: gifts.map((gift) => ({
        id: gift._id,
        amount: gift.total_amount,
        type: gift.sender_id._id.toString() === userId ? 'sent' : 'received',
        from: gift.sender_id.username,
        to: gift.receiver_id.username,
        videoTitle:
          gift.content_id?.name || gift.content_id?.title || 'Unknown Video',
        commentPreview: gift.metadata?.comment_text || '',
        giftNote: gift.metadata?.transfer_note || '',
        date: gift.createdAt,
        status: gift.status,
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalGifts: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
        itemsPerPage: limitNum,
      },
      summary: {
        totalSent: gifts
          .filter((g) => g.sender_id._id.toString() === userId)
          .reduce((sum, g) => sum + g.total_amount, 0),
        totalReceived: gifts
          .filter((g) => g.receiver_id._id.toString() === userId)
          .reduce((sum, g) => sum + g.total_amount, 0),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  getWalletDetails,
  createWalletLoadOrder,
  verifyWalletLoad,
  transferToCreatorForSeries,
  transferCommunityFee,
  getWalletTransactionHistory,
  getOrCreateWallet,
  getGiftHistory,
}
