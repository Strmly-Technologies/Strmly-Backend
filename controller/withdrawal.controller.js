const mongoose = require('mongoose')
const razorpay = require('../config/razorpay')
const Wallet = require('../models/Wallet')
const Withdrawal = require('../models/Withdrawal')
const WalletTransaction = require('../models/WalletTransaction')
const User = require('../models/User')
const { handleError } = require('../utils/utils')
const { sendEmail } = require('../utils/email')

const MIN_WITHDRAWAL_AMOUNT = 100
const MAX_WITHDRAWAL_AMOUNT = 100000
const MAX_NOTES_LENGTH = 200
const PLATFORM_FEE_PERCENTAGE = 30
const validateAmount = (amount) => {
  if (!amount || typeof amount !== 'number') {
    return {
      isValid: false,
      error: 'Amount is required and must be a number',
    }
  }
  if (amount < MIN_WITHDRAWAL_AMOUNT) {
    return {
      isValid: false,
      error: `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}`,
    }
  }
  if (amount > MAX_WITHDRAWAL_AMOUNT) {
    return {
      isValid: false,
      error: `Maximum withdrawal amount is ₹${MAX_WITHDRAWAL_AMOUNT} per transaction`,
    }
  }
  return { isValid: true }
}

const validateObjectId = (id, fieldName = 'ID') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { isValid: false, error: `Invalid ${fieldName}` }
  }
  return { isValid: true }
}

const generateReferenceId = (creatorId) => {
  const shortId = creatorId.toString().slice(-8)
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.random().toString(36).substr(2, 4)
  return `WD_${shortId}_${timestamp}_${random}`
}

const createWithdrawalRequest = async (req, res, next) => {
  try {
    const { amount, notes } = req.body
    const creatorId = req.user.id

    const amountValidation = validateAmount(amount)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    if (notes && notes.length > MAX_NOTES_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Notes must be less than ${MAX_NOTES_LENGTH} characters`,
        code: 'INVALID_NOTES_LENGTH',
      })
    }

    const creator = await User.findById(creatorId)
    if (!creator) {
      return res.status(404).json({
        success: false,
        error: 'Creator not found',
        code: 'CREATOR_NOT_FOUND',
      })
    }

    if (!creator.creator_profile?.fund_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Bank account not setup. Please add your bank details first.',
        action: 'setup_bank_account',
        code: 'BANK_ACCOUNT_NOT_SETUP',
      })
    }

    const wallet = await Wallet.findOne({ user_id: creatorId })
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found',
        code: 'WALLET_NOT_FOUND',
      })
    }

    if (wallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Wallet is not active',
        code: 'WALLET_INACTIVE',
      })
    }

    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: wallet.balance,
        requestedAmount: amount,
        shortfall: amount - wallet.balance,
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    const platformFee = Math.round(amount * (PLATFORM_FEE_PERCENTAGE / 100))
    const finalAmount = amount - platformFee

    const referenceId = generateReferenceId(creatorId)

    const session = await mongoose.startSession()

    try {
      await session.withTransaction(async () => {
        const withdrawal = new Withdrawal({
          creator_id: creatorId,
          wallet_id: wallet._id,
          amount: amount,
          currency: 'INR',
          fund_account_id: creator.creator_profile.fund_account_id,
          status: 'pending',
          bank_details: creator.creator_profile.bank_details,
          wallet_balance_before: wallet.balance,
          wallet_balance_after: wallet.balance - amount,
          platform_fee: platformFee,
          final_amount: finalAmount,
          reference_id: referenceId,
          internal_notes: notes || '',
          requested_at: new Date(),
        })

        await withdrawal.save({ session })

        wallet.balance -= amount
        wallet.total_withdrawn += amount
        wallet.last_transaction_at = new Date()
        await wallet.save({ session })

        const walletTransaction = new WalletTransaction({
          wallet_id: wallet._id,
          user_id: creatorId,
          transaction_type: 'debit',
          transaction_category: 'withdrawal_request',
          amount: amount,
          currency: 'INR',
          description: `Withdrawal request: ₹${amount} to bank account`,
          balance_before: wallet.balance + amount,
          balance_after: wallet.balance,
          status: 'pending',
          metadata: {
            withdrawal_id: withdrawal._id,
            reference_id: referenceId,
            bank_account:
              creator.creator_profile.bank_details.account_number?.slice(-4),
          },
        })

        await walletTransaction.save({ session })

        try {
          const payout = await razorpay.payouts.create({
            fund_account_id: creator.creator_profile.fund_account_id,
            amount: finalAmount * 100,
            currency: 'INR',
            mode: 'IMPS',
            purpose: 'payout',
            queue_if_low_balance: true,
            reference_id: referenceId,
            narration: `Strmly Creator Withdrawal - ${referenceId}`,
            notes: {
              creator_id: creatorId,
              creator_name: creator.username,
              withdrawal_amount: amount,
              platform_fee: platformFee,
            },
          })

          withdrawal.razorpay_payout_id = payout.id
          withdrawal.status = payout.status
          if (payout.status === 'processed') {
            withdrawal.processed_at = new Date()
            withdrawal.utr = payout.utr
          }
          await withdrawal.save({ session })

          walletTransaction.status = 'completed'
          await walletTransaction.save({ session })
        } catch (payoutError) {
          wallet.balance += amount
          wallet.total_withdrawn -= amount
          await wallet.save({ session })

          withdrawal.status = 'failed'
          withdrawal.failure_reason = payoutError.message
          await withdrawal.save({ session })

          walletTransaction.status = 'failed'
          await walletTransaction.save({ session })

          throw new Error(`Payout initiation failed: ${payoutError.message}`)
        }
      })

      const finalWithdrawal = await Withdrawal.findOne({
        reference_id: referenceId,
      }).populate('creator_id', 'username email')

      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        withdrawal: {
          id: finalWithdrawal._id,
          referenceId: finalWithdrawal.reference_id,
          amount: finalWithdrawal.amount,
          finalAmount: finalWithdrawal.final_amount,
          platformFee: finalWithdrawal.platform_fee,
          status: finalWithdrawal.status,
          requestedAt: finalWithdrawal.requested_at,
          processedAt: finalWithdrawal.processed_at,
          bankDetails: {
            accountNumber:
              finalWithdrawal.bank_details.account_number?.slice(-4),
            ifscCode: finalWithdrawal.bank_details.ifsc_code,
            beneficiaryName: finalWithdrawal.bank_details.beneficiary_name,
          },
        },
        wallet: {
          balanceBefore: finalWithdrawal.wallet_balance_before,
          balanceAfter: finalWithdrawal.wallet_balance_after,
          currentBalance: wallet.balance,
        },
        timeline: {
          estimatedDelivery: '2-3 business days',
          trackingInfo: finalWithdrawal.razorpay_payout_id
            ? `Track with ID: ${finalWithdrawal.razorpay_payout_id}`
            : 'Processing...',
        },
      })
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      if (session.inTransaction()) {
        await session.endSession()
      }
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const createUPIWithdrawalRequest = async (req, res, next) => {
  try {
    const { amount, notes } = req.body
    const creatorId = req.user.id

    const amountValidation = validateAmount(amount)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    if (notes && notes.length > MAX_NOTES_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Notes must be less than ${MAX_NOTES_LENGTH} characters`,
        code: 'INVALID_NOTES_LENGTH',
      })
    }

    const creator = await User.findById(creatorId)
    if (!creator) {
      return res.status(404).json({
        success: false,
        error: 'Creator not found',
        code: 'CREATOR_NOT_FOUND',
      })
    }

    if (!creator.creator_profile?.upi_fund_account_id) {
      return res.status(400).json({
        success: false,
        error: 'UPI ID not setup. Please add your UPI ID first.',
        action: 'setup_UPI_ID',
        code: 'UPI_ID_NOT_SETUP',
      })
    }

    const wallet = await Wallet.findOne({ user_id: creatorId })
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found',
        code: 'WALLET_NOT_FOUND',
      })
    }

    if (wallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Wallet is not active',
        code: 'WALLET_INACTIVE',
      })
    }

    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: wallet.balance,
        requestedAmount: amount,
        shortfall: amount - wallet.balance,
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    const platformFee = Math.round(amount * (PLATFORM_FEE_PERCENTAGE / 100))
    const finalAmount = amount - platformFee

    const referenceId = generateReferenceId(creatorId)

    const session = await mongoose.startSession()

    try {
      await session.withTransaction(async () => {
        const withdrawal = new Withdrawal({
          creator_id: creatorId,
          wallet_id: wallet._id,
          amount: amount,
          currency: 'INR',
          fund_account_id: creator.creator_profile.upi_fund_account_id,
          upi_id: creator.creator_profile.upi_id,
          status: 'pending',
          wallet_balance_before: wallet.balance,
          wallet_balance_after: wallet.balance - amount,
          platform_fee: platformFee,
          final_amount: finalAmount,
          reference_id: referenceId,
          internal_notes: notes || '',
          requested_at: new Date(),
        })

        await withdrawal.save({ session })

        wallet.balance -= amount
        wallet.total_withdrawn += amount
        wallet.last_transaction_at = new Date()
        await wallet.save({ session })

        const walletTransaction = new WalletTransaction({
          wallet_id: wallet._id,
          user_id: creatorId,
          transaction_type: 'debit',
          transaction_category: 'withdrawal_request',
          amount: amount,
          currency: 'INR',
          description: `Withdrawal request: ₹${amount} to bank account`,
          balance_before: wallet.balance + amount,
          balance_after: wallet.balance,
          status: 'pending',
          metadata: {
            withdrawal_id: withdrawal._id,
            reference_id: referenceId,
          },
        })

        await walletTransaction.save({ session })

        try {
          const payout = await razorpay.payouts.create({
            fund_account_id: creator.creator_profile.upi_fund_account_id,
            amount: finalAmount * 100,
            currency: 'INR',
            mode: 'IMPS',
            purpose: 'payout',
            queue_if_low_balance: true,
            reference_id: referenceId,
            narration: `Strmly Creator Withdrawal - ${referenceId}`,
            notes: {
              creator_id: creatorId,
              creator_name: creator.username,
              withdrawal_amount: amount,
              platform_fee: platformFee,
            },
          })

          withdrawal.razorpay_payout_id = payout.id
          withdrawal.status = payout.status
          if (payout.status === 'processed') {
            withdrawal.processed_at = new Date()
            withdrawal.utr = payout.utr
          }
          await withdrawal.save({ session })

          walletTransaction.status = 'completed'
          await walletTransaction.save({ session })
        } catch (payoutError) {
          wallet.balance += amount
          wallet.total_withdrawn -= amount
          await wallet.save({ session })

          withdrawal.status = 'failed'
          withdrawal.failure_reason = payoutError.message
          await withdrawal.save({ session })

          walletTransaction.status = 'failed'
          await walletTransaction.save({ session })

          throw new Error(`Payout initiation failed: ${payoutError.message}`)
        }
      })

      const finalWithdrawal = await Withdrawal.findOne({
        reference_id: referenceId,
      }).populate('creator_id', 'username email')

      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        withdrawal: {
          id: finalWithdrawal._id,
          referenceId: finalWithdrawal.reference_id,
          amount: finalWithdrawal.amount,
          finalAmount: finalWithdrawal.final_amount,
          platformFee: finalWithdrawal.platform_fee,
          status: finalWithdrawal.status,
          requestedAt: finalWithdrawal.requested_at,
          processedAt: finalWithdrawal.processed_at,
          upiId: creator.creator_profile.upi_id,
        },
        wallet: {
          balanceBefore: finalWithdrawal.wallet_balance_before,
          balanceAfter: finalWithdrawal.wallet_balance_after,
          currentBalance: wallet.balance,
        },
        timeline: {
          estimatedDelivery: '2-3 business days',
          trackingInfo: finalWithdrawal.razorpay_payout_id
            ? `Track with ID: ${finalWithdrawal.razorpay_payout_id}`
            : 'Processing...',
        },
      })
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      if (session.inTransaction()) {
        await session.endSession()
      }
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const createManualWithdrawalRequest = async (req, res, next) => {
  try {
    const { amount, notes } = req.body
    const creatorId = req.user.id

    const amountValidation = validateAmount(amount)
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT',
      })
    }

    if (notes && notes.length > MAX_NOTES_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Notes must be less than ${MAX_NOTES_LENGTH} characters`,
        code: 'INVALID_NOTES_LENGTH',
      })
    }

    const creator = await User.findById(creatorId)
    if (!creator) {
      return res.status(404).json({
        success: false,
        error: 'Creator not found',
        code: 'CREATOR_NOT_FOUND',
      })
    }

    // Check if either bank or UPI is setup
    if (!creator.creator_profile?.fund_account_id && !creator.creator_profile?.upi_fund_account_id) {
      return res.status(400).json({
        success: false,
        error: 'No payout method setup. Please add bank details or UPI ID first.',
        action: 'setup_payout_method',
        code: 'PAYOUT_METHOD_NOT_SETUP',
      })
    }

    const wallet = await Wallet.findOne({ user_id: creatorId })
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found',
        code: 'WALLET_NOT_FOUND',
      })
    }

    if (wallet.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Wallet is not active',
        code: 'WALLET_INACTIVE',
      })
    }

    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
        currentBalance: wallet.balance,
        requestedAmount: amount,
        shortfall: amount - wallet.balance,
        code: 'INSUFFICIENT_BALANCE',
      })
    }

    const platformFee = Math.round(amount * (PLATFORM_FEE_PERCENTAGE / 100))
    const finalAmount = amount - platformFee
    const referenceId = generateReferenceId(creatorId)

    const session = await mongoose.startSession()

    try {
      let withdrawal
      await session.withTransaction(async () => {
        withdrawal = new Withdrawal({
          creator_id: creatorId,
          wallet_id: wallet._id,
          amount: amount,
          currency: 'INR',
          fund_account_id: creator.creator_profile.fund_account_id || creator.creator_profile.upi_fund_account_id,
          status: 'pending',
          bank_details: creator.creator_profile.bank_details,
          upi_id: creator.creator_profile.upi_id || null,
          wallet_balance_before: wallet.balance,
          wallet_balance_after: wallet.balance - amount,
          platform_fee: platformFee,
          final_amount: finalAmount,
          reference_id: referenceId,
          internal_notes: `[MANUAL_WITHDRAWAL] ${notes || ''}`.trim(),
          requested_at: new Date(),
        })

        await withdrawal.save({ session })

        wallet.balance -= amount
        wallet.total_withdrawn += amount
        wallet.last_transaction_at = new Date()
        await wallet.save({ session })

        const walletTransaction = new WalletTransaction({
          wallet_id: wallet._id,
          user_id: creatorId,
          transaction_type: 'debit',
          transaction_category: 'withdrawal_request',
          amount: amount,
          currency: 'INR',
          description: `Manual withdrawal request: ₹${amount} (processing in 7 days)`,
          balance_before: wallet.balance + amount,
          balance_after: wallet.balance,
          status: 'pending',
          metadata: {
            withdrawal_id: withdrawal._id,
            reference_id: referenceId,
            manual: true,
            platform_fee: platformFee,
            bank_account: creator.creator_profile.bank_details?.account_number?.slice(-4),
          },
        })

        await walletTransaction.save({ session })
      })

      // Send notification email to user
      try {
        await sendEmail(
          creator.email,
          'Withdrawal Request Received - Processing in 7 Days',
          `Hi ${creator.username},

We have received your withdrawal request of ₹${amount} (Reference: ${referenceId}).

Your request will be processed manually within 7 business days.
Amount after platform fee: ₹${finalAmount}

We will send you another email once the money has been transferred to your account.

Regards,
Strmly Team`
        )
      } catch (emailError) {
        console.error('Email send failed (non-blocking):', emailError.message)
      }

      res.status(201).json({
        success: true,
        message: 'Manual withdrawal request submitted successfully. Processing will take up to 7 business days.',
        withdrawal: {
          id: withdrawal._id,
          referenceId: withdrawal.reference_id,
          amount: withdrawal.amount,
          finalAmount: withdrawal.final_amount,
          platformFee: withdrawal.platform_fee,
          status: withdrawal.status,
          requestedAt: withdrawal.requested_at,
          manual: true,
        },
        wallet: {
          balanceBefore: withdrawal.wallet_balance_before,
          balanceAfter: withdrawal.wallet_balance_after,
          currentBalance: wallet.balance,
        },
        timeline: {
          estimatedDelivery: '7 business days',
          trackingInfo: `Manual processing - Reference: ${withdrawal.reference_id}`,
        },
      })
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      await session.endSession()
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getWithdrawalHistory = async (req, res, next) => {
  try {
    const creatorId = req.user.id
    const { page = 1, limit = 20, status, timePeriod = '7d' } = req.query

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

    const filter = { creator_id: creatorId }

    if (status) {
      const validStatuses = [
        'pending',
        'queued',
        'processing',
        'processed',
        'cancelled',
        'failed',
        'reversed',
      ]
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Status must be one of: ${validStatuses.join(', ')}`,
          code: 'INVALID_STATUS',
        })
      }
      filter.status = status
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

    const withdrawals = await Withdrawal.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .select('-bank_details.account_number')
      .lean()

    const total = await Withdrawal.countDocuments(filter)

    res.status(200).json({
      success: true,
      message: 'Withdrawal history retrieved successfully',
      withdrawals: withdrawals.map((wd) => ({
        id: wd._id,
        referenceId: wd.reference_id,
        amount: wd.amount,
        finalAmount: wd.final_amount,
        platformFee: wd.platform_fee,
        status: wd.status,
        requestedAt: wd.requested_at,
        processedAt: wd.processed_at,
        bankAccount: wd.bank_details?.account_number
          ? wd.bank_details.account_number.slice(-4)
          : null,
        upiId: wd.upi_id ?? null,
        ifscCode: wd.bank_details?.ifsc_code ?? null,
        utr: wd.utr,
        failureReason: wd.failure_reason,
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalWithdrawals: total,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
        itemsPerPage: limitNum,
      },
      summary: {
        totalWithdrawn: withdrawals.reduce(
          (sum, wd) =>
            wd.status === 'processed' ? sum + wd.final_amount : sum,
          0
        ),
        pendingAmount: withdrawals.reduce(
          (sum, wd) =>
            ['pending', 'queued', 'processing'].includes(wd.status)
              ? sum + wd.amount
              : sum,
          0
        ),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const checkWithdrawalStatus = async (req, res, next) => {
  try {
    const { withdrawalId } = req.params
    const creatorId = req.user.id

    const withdrawalValidation = validateObjectId(withdrawalId, 'Withdrawal ID')
    if (!withdrawalValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: withdrawalValidation.error,
        code: 'INVALID_WITHDRAWAL_ID',
      })
    }

    const withdrawal = await Withdrawal.findOne({
      _id: withdrawalId,
      creator_id: creatorId,
    })

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found',
        code: 'WITHDRAWAL_NOT_FOUND',
      })
    }

    if (withdrawal.razorpay_payout_id) {
      try {
        const payout = await razorpay.payouts.fetch(
          withdrawal.razorpay_payout_id
        )

        if (payout.status !== withdrawal.status) {
          withdrawal.status = payout.status
          if (payout.status === 'processed' && !withdrawal.processed_at) {
            withdrawal.processed_at = new Date()
            withdrawal.utr = payout.utr
          }
          await withdrawal.save()
        }
      } catch (razorpayError) {
        console.error('Error fetching payout:', razorpayError)
      }
    }

    res.status(200).json({
      success: true,
      message: 'Withdrawal status retrieved',
      withdrawal: {
        id: withdrawal._id,
        referenceId: withdrawal.reference_id,
        amount: withdrawal.amount,
        finalAmount: withdrawal.final_amount,
        status: withdrawal.status,
        requestedAt: withdrawal.requested_at,
        processedAt: withdrawal.processed_at,
        utr: withdrawal.utr,
        failureReason: withdrawal.failure_reason,
        timeline: getWithdrawalTimeline(withdrawal.status),
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getWithdrawalTimeline = (status) => {
  const timelines = {
    pending: 'Withdrawal request received, processing...',
    queued: 'Withdrawal queued, will be processed shortly',
    processing: 'Payment is being processed by bank',
    processed: 'Money transferred successfully to your bank account',
    failed: 'Withdrawal failed, money refunded to wallet',
    cancelled: 'Withdrawal cancelled, money refunded to wallet',
  }

  return timelines[status] || 'Status unknown'
}

module.exports = {
  createWithdrawalRequest,
  createUPIWithdrawalRequest,
  getWithdrawalHistory,
  checkWithdrawalStatus,
  createManualWithdrawalRequest,
}
