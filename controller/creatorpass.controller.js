const crypto = require('crypto')

const razorpay = require('../config/razorpay')
const CreatorPass = require('../models/CreatorPass')
const User = require('../models/User')

const { handleError } = require('../utils/utils')

const generateShortReceipt = (prefix, userId) => {
  const shortUserId = userId.toString().slice(-8)
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.random().toString(36).substr(2, 4)
  return `${prefix}_${shortUserId}_${timestamp}_${random}`
}

const createCreatorPassOrder = async (req, res, next) => {
  try {
    const { creatorId } = req.body
    const userId = req.user.id

    if (!creatorId) {
      return res.status(400).json({
        success: false,
        error: 'Creator ID is required',
        code: 'MISSING_CREATOR_ID',
      })
    }

    // Check if creator exists
    const creator = await User.findById(creatorId).select(
      'username creator_profile'
    )
    if (!creator) {
      return res.status(404).json({
        success: false,
        error: 'Creator not found',
        code: 'CREATOR_NOT_FOUND',
      })
    }

    // Check if user is trying to buy their own pass
    if (creatorId === userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot buy your own creator pass',
        code: 'CANNOT_BUY_OWN_PASS',
      })
    }

    // Check if user already has active creator pass
    const existingPass = await CreatorPass.findOne({
      user_id: userId,
      creator_id: creatorId,
      status: 'active',
      end_date: { $gt: new Date() },
    })

    if (existingPass) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active Creator Pass for this creator',
        code: 'ACTIVE_PASS_EXISTS',
        currentPass: {
          creatorName: creator.username,
          expiresAt: existingPass.end_date,
        },
      })
    }

    // Get creator pass price (default 199 if not set)
    const amount = creator.creator_profile?.creator_pass_price || 199

    const orderOptions = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: generateShortReceipt('CP', userId),
      notes: {
        userId: userId,
        creatorId: creatorId,
        purpose: 'creator_pass',
        creator_name: creator.username,
      },
    }

    const razorpayOrder = await razorpay.orders.create(orderOptions)

    res.status(201).json({
      success: true,
      message: 'Creator Pass order created successfully',
      order: {
        orderId: razorpayOrder.id,
        amount: amount,
        currency: 'INR',
        receipt: razorpayOrder.receipt,
        creatorName: creator.username,
        duration: '30 days',
      },
      razorpayConfig: {
        key: process.env.RAZORPAY_KEY_ID,
        order_id: razorpayOrder.id,
        amount: Math.round(amount * 100),
        currency: 'INR',
        name: 'Creator Pass',
        description: `Creator Pass for ${creator.username} - Access all their content`,
        prefill: {
          name: req.user.username,
          email: req.user.email,
        },
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const verifyCreatorPassPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body
    const userId = req.user.id

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification fields',
        code: 'MISSING_PAYMENT_FIELDS',
      })
    }

    // Verify signature
    const generated_signature = crypto
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

    // Check if payment already processed
    const existingPass = await CreatorPass.findOne({
      razorpay_payment_id: razorpay_payment_id,
      user_id: userId,
    })

    if (existingPass) {
      return res.status(400).json({
        success: false,
        error: 'Payment already processed',
        code: 'PAYMENT_ALREADY_PROCESSED',
      })
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id)

    if (payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        error: 'Payment not captured successfully',
        code: 'PAYMENT_NOT_CAPTURED',
      })
    }

    const creatorId = payment.notes.creatorId
    const amount = payment.amount / 100

    // Calculate pass dates (30 days duration)
    const start_date = new Date()
    const end_date = new Date(start_date)
    end_date.setDate(end_date.getDate() + 30)

    // Get creator details
    const creator = await User.findById(creatorId).select('username')

    // Create creator pass record
    const creatorPass = new CreatorPass({
      user_id: userId,
      creator_id: creatorId,
      amount_paid: amount,
      start_date: start_date,
      end_date: end_date,
      status: 'active',
      payment_id: razorpay_payment_id,
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
      metadata: {
        purchase_platform: 'web',
        original_price: amount,
      },
    })

    await creatorPass.save()

    res.status(200).json({
      success: true,
      message: 'Creator Pass activated successfully!',
      creatorPass: {
        id: creatorPass._id,
        creatorName: creator.username,
        amount: amount,
        startDate: start_date,
        endDate: end_date,
        status: 'active',
      },
      benefits: {
        message: `You now have unlimited access to all content by ${creator.username}!`,
        features: [
          "Access to all creator's paid videos",
          "Access to all creator's paid series",
          'Priority support from creator',
          'Exclusive content access',
        ],
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const checkCreatorPassAccess = async (userId, creatorId) => {
  try {
    const activePass = await CreatorPass.findOne({
      user_id: userId,
      creator_id: creatorId,
      status: 'active',
      end_date: { $gt: new Date() }, // Only active and not expired
    })

    if (activePass) {
      // Double-check expiry in case of edge cases
      const now = new Date()
      if (activePass.end_date <= now) {
        // Mark as expired
        activePass.status = 'expired'
        await activePass.save()
        return { hasAccess: false, pass: null, reason: 'expired' }
      }
    }

    return {
      hasAccess: !!activePass,
      pass: activePass,
      daysRemaining: activePass ? Math.ceil((activePass.end_date - new Date()) / (1000 * 60 * 60 * 24)) : 0,
    }
  } catch (error) {
    console.error('Error checking Creator Pass access:', error)
    return { hasAccess: false, pass: null, reason: 'error' }
  }
}

const getCreatorPassStatus = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { creatorId } = req.params

    const activePass = await CreatorPass.findOne({
      user_id: userId,
      creator_id: creatorId,
      status: 'active',
      end_date: { $gt: new Date() },
    }).populate('creator_id', 'username')

    if (!activePass) {
      // Check if there's an expired pass
      const expiredPass = await CreatorPass.findOne({
        user_id: userId,
        creator_id: creatorId,
        status: { $in: ['active', 'expired'] },
      }).populate('creator_id', 'username').sort({ end_date: -1 })

      const creator = await User.findById(creatorId).select(
        'username creator_profile'
      )

      return res.status(200).json({
        success: true,
        hasActivePass: false,
        message: expiredPass ? 'Your Creator Pass has expired' : 'No Creator Pass for this creator',
        creator: {
          name: creator?.username,
          passPrice: creator?.creator_profile?.creator_pass_price || 199,
        },
        lastPass: expiredPass ? {
          expiredAt: expiredPass.end_date,
          status: expiredPass.status,
        } : null,
      })
    }

    const daysRemaining = Math.ceil(
      (activePass.end_date - new Date()) / (1000 * 60 * 60 * 24)
    )

    res.status(200).json({
      success: true,
      hasActivePass: true,
      creatorPass: {
        id: activePass._id,
        creatorName: activePass.creator_id.username,
        startDate: activePass.start_date,
        endDate: activePass.end_date,
        daysRemaining: daysRemaining,
        status: activePass.status,
        subscriptionType: 'monthly',
      },
      benefits: {
        features: [
          "Access to all creator's paid videos",
          "Access to all creator's paid series",
          'Priority support from creator',
          'Exclusive content access',
        ],
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const cancelCreatorPass = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { creatorId } = req.params

    const activePass = await CreatorPass.findOne({
      user_id: userId,
      creator_id: creatorId,
      status: 'active',
      end_date: { $gt: new Date() },
    }).populate('creator_id', 'username')

    if (!activePass) {
      return res.status(404).json({
        success: false,
        error: 'No active Creator Pass found for this creator',
        code: 'NO_ACTIVE_PASS',
      })
    }

    // Mark as cancelled
    activePass.auto_renewal = false
    activePass.cancelled_at = new Date()
    await activePass.save()

    res.status(200).json({
      success: true,
      message: 'Creator Pass cancelled successfully',
      creatorPass: {
        id: activePass._id,
        creatorName: activePass.creator_id.username,
        endDate: activePass.end_date,
        message: 'Your pass will remain active until the end date',
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  createCreatorPassOrder,
  verifyCreatorPassPayment,
  getCreatorPassStatus,
  checkCreatorPassAccess,
  cancelCreatorPass,
}
