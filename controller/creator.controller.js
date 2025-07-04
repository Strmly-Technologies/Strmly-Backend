const razorpay = require('../config/razorpay');
const User = require('../models/User');
const { handleError } = require('../utils/utils');

// Setup creator bank account for withdrawals
const setupCreatorBankAccount = async (req, res, next) => {
  try {
    const {
      account_number,
      ifsc_code,
      beneficiary_name,
      bank_name,
      account_type // savings or current
    } = req.body;
    
    const userId = req.user.id;
    
    // Validate required fields
    if (!account_number || !ifsc_code || !beneficiary_name) {
      return res.status(400).json({
        error: "Bank account details are required",
        required: ["account_number", "ifsc_code", "beneficiary_name"]
      });
    }
    
    // Create fund account in Razorpay for payouts
    const fundAccount = await razorpay.fundAccount.create({
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
        reference_id: userId
      }
    });
    
    // Save bank details to user profile
    await User.findByIdAndUpdate(userId, {
      'creator_profile.bank_details': {
        account_number: account_number,
        ifsc_code: ifsc_code,
        beneficiary_name: beneficiary_name,
        bank_name: bank_name,
        account_type: account_type || 'savings'
      },
      'creator_profile.fund_account_id': fundAccount.id,
      'creator_profile.withdrawal_enabled': true,
      'creator_profile.bank_verified': false // Will be verified on first successful withdrawal
    });
    
    res.json({
      message: "Bank account setup successful",
      fundAccountId: fundAccount.id,
      bankDetails: {
        accountNumber: account_number.slice(-4), // Show only last 4 digits
        ifscCode: ifsc_code,
        beneficiaryName: beneficiary_name,
        bankName: bank_name
      },
      note: "You can now withdraw money from your wallet to this bank account"
    });
    
  } catch (error) {
    console.error('❌ Error setting up bank account:', error);
    handleError(error, req, res, next);
  }
};

module.exports = {
  setupCreatorBankAccount,
};