const razorpay = require('../config/razorpay')
const User = require('../models/User')
const { handleError } = require('../utils/utils')

const setupCreatorBankAccount = async (req, res, next) => {
  try {
    const {
      account_number,
      ifsc_code,
      beneficiary_name,
      bank_name,
      account_type,
    } = req.body

    const userId = req.user.id

    if (!account_number || !ifsc_code || !beneficiary_name) {
      return res.status(400).json({
        success: false,
        error: 'Bank account details are required',
        required: ['account_number', 'ifsc_code', 'beneficiary_name'],
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    if (!/^\d{9,18}$/.test(account_number)) {
      return res.status(400).json({
        success: false,
        error: 'Account number must be 9-18 digits',
        code: 'INVALID_ACCOUNT_NUMBER',
      })
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IFSC code format',
        code: 'INVALID_IFSC_CODE',
      })
    }

    if (beneficiary_name.length < 2 || beneficiary_name.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Beneficiary name must be between 2 and 50 characters',
        code: 'INVALID_BENEFICIARY_NAME',
      })
    }

    if (account_type && !['savings', 'current'].includes(account_type)) {
      return res.status(400).json({
        success: false,
        error: "Account type must be 'savings' or 'current'",
        code: 'INVALID_ACCOUNT_TYPE',
      })
    }

    const existingUser = await User.findById(userId)
    if (existingUser.creator_profile?.fund_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Bank account already exists. Please contact support to update.',
        code: 'BANK_ACCOUNT_EXISTS',
      })
    }

    let fundAccount
    try {
      fundAccount = await razorpay.fundAccount.create({
        account_type: 'bank_account',
        bank_account: {
          name: beneficiary_name,
          ifsc: ifsc_code,
          account_number: account_number,
        },
        contact: {
          name: req.user.username,
          email: req.user.email,
          contact: req.user.phone || '9999999999',
          type: 'vendor',
          reference_id: userId,
        },
      })
    } catch (razorpayError) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create fund account with Razorpay',
        details: razorpayError.message,
        code: 'RAZORPAY_FUND_ACCOUNT_ERROR',
      })
    }

    try {
      await User.findByIdAndUpdate(userId, {
        'creator_profile.bank_details': {
          account_number: account_number,
          ifsc_code: ifsc_code,
          beneficiary_name: beneficiary_name,
          bank_name: bank_name || 'Unknown',
          account_type: account_type || 'savings',
        },
        'creator_profile.fund_account_id': fundAccount.id,
        'creator_profile.withdrawal_enabled': true,
        'creator_profile.bank_verified': false,
      })
    } catch (dbError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save bank details: ' + dbError.message,
        code: 'DATABASE_ERROR',
      })
    }

    res.status(200).json({
      success: true,
      message: 'Bank account setup successful',
      fundAccountId: fundAccount.id,
      bankDetails: {
        accountNumber: account_number.slice(-4),
        ifscCode: ifsc_code,
        beneficiaryName: beneficiary_name,
        bankName: bank_name || 'Unknown',
        accountType: account_type || 'savings',
      },
      note: 'You can now withdraw money from your wallet to this bank account',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

//upi fund account id should have the same contact id as bank account
const setupCreatorUPI = async (req, res, next) => {
  try {
    const { upi_id } = req.body

    const userId = req.user.id.toString()

    if (!upi_id) {
      return res.status(400).json({
        success: false,
        error: 'UPI ID is required',
        required: ['upi_id'],
        code: 'MISSING_REQUIRED_FIELDS',
      })
    }

    if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upi_id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid UPI ID format',
        code: 'INVALID_UPI_ID',
      })
    }

    const existingUser = await User.findById(userId)
    if (existingUser.creator_profile?.upi_fund_account_id) {
      return res.status(400).json({
        success: false,
        error: 'UPI ID already registered. Please contact support to update.',
        code: 'UPI_ID_EXISTS',
      })
    }

    let fundAccount
    try {
      fundAccount = await razorpay.fundAccount.create({
        account_type: 'vpa',
        vpa: {
          address: upi_id,
        },
        contact: {
          name: req.user.username,
          email: req.user.email,
          contact: req.user.phone || '9999999999',
          type: 'vendor',
          reference_id: userId,
        },
      })
    } catch (razorpayError) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create fund account with Razorpay',
        details: razorpayError.message,
        code: 'RAZORPAY_FUND_ACCOUNT_ERROR',
      })
    }

    try {
      await User.findByIdAndUpdate(userId, {
        'creator_profile.upi_id': upi_id,
        'creator_profile.upi_fund_account_id': fundAccount.id,
        'creator_profile.withdrawal_enabled': true,
        'creator_profile.bank_verified': false,
      })
    } catch (dbError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save bank details: ' + dbError.message,
        code: 'DATABASE_ERROR',
      })
    }

    res.status(200).json({
      success: true,
      message: 'UPI setup successful',
      fundAccountId: fundAccount.id,
      upiId: upi_id,
      note: 'You can now withdraw money from your wallet to this UPI ID',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  setupCreatorBankAccount,
  setupCreatorUPI,
}
