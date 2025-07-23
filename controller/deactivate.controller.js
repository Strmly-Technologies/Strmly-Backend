const User = require('../models/User')
const LongVideo = require('../models/LongVideo')
const { handleError } = require('../utils/utils')

const deactivateAccount = async (req, res, next) => {
  try {
    const { password, reason } = req.body
    const userId = req.user.id

    // Find user and verify password
    const user = await User.findById(userId).select('+password')
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    // Check if already deactivated
    if (user.isDeactivated()) {
      return res.status(400).json({
        success: false,
        error: 'Account is already deactivated'
      })
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid password'
      })
    }

    // Deactivate account
    await user.deactivateAccount(reason || 'User requested deactivation')

    // Hide all user's videos
    await LongVideo.updateMany(
      { created_by: userId },
      {
        $set: {
          visibility: 'hidden',
          hidden_reason: 'account_deactivated',
          hidden_at: new Date()
        }
      }
    )

    res.status(200).json({
      success: true,
      message: 'Account deactivated successfully',
      data: {
        deactivatedAt: user.account_status.deactivated_at,
        reason: user.account_status.deactivation_reason,
        note: 'Your videos are now hidden. Login again anytime to reactivate your account.'
      }
    })

  } catch (error) {
    handleError(error, req, res, next)
  }
}

const reactivateAccount = async (req, res, next) => {
  try {
    const { password } = req.body
    const userId = req.user.id

    // Find user and verify password
    const user = await User.findById(userId).select('+password')
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    // Check if account is deactivated
    if (!user.isDeactivated()) {
      return res.status(400).json({
        success: false,
        error: 'Account is not deactivated'
      })
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid password'
      })
    }

    // Reactivate account
    await user.reactivateAccount()

    // Show all user's videos that were hidden due to account deactivation
    await LongVideo.updateMany(
      { 
        created_by: userId,
        hidden_reason: 'account_deactivated'
      },
      {
        $set: {
          visibility: 'public',
          hidden_reason: null,
          hidden_at: null
        }
      }
    )

    res.status(200).json({
      success: true,
      message: 'Account reactivated successfully',
      data: {
        reactivatedAt: new Date(),
        note: 'Your videos are now visible again.'
      }
    })

  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getAccountStatus = async (req, res, next) => {
  try {
    const userId = req.user.id
    const user = await User.findById(userId)

    res.status(200).json({
      success: true,
      account: {
        isDeactivated: user.isDeactivated(),
        deactivatedAt: user.account_status.deactivated_at,
        deactivationReason: user.account_status.deactivation_reason,
        username: user.username,
        email: user.email
      }
    })

  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  deactivateAccount,
  reactivateAccount,
  getAccountStatus
}