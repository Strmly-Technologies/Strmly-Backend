const mongoose = require('mongoose');
const razorpay = require('../config/razorpay');
const Wallet = require('../models/Wallet');
const Withdrawal = require('../models/Withdrawal');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const { handleError } = require('../utils/utils');

// Create withdrawal request
const createWithdrawalRequest = async (req, res, next) => {
  try {
    const { amount, notes } = req.body;
    const creatorId = req.user.id;
    
    // Validate amount
    if (!amount || amount < 100) {
      return res.status(400).json({
        error: "Minimum withdrawal amount is ₹100"
      });
    }
    
    if (amount > 100000) {
      return res.status(400).json({
        error: "Maximum withdrawal amount is ₹1,00,000 per transaction"
      });
    }
    
    // Get creator details
    const creator = await User.findById(creatorId);
    if (!creator.creator_profile?.fund_account_id) {
      return res.status(400).json({
        error: "Bank account not setup. Please add your bank details first.",
        action: "setup_bank_account"
      });
    }
    
    // Get creator wallet
    const wallet = await Wallet.findOne({ user_id: creatorId });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    
    if (wallet.status !== 'active') {
      return res.status(400).json({ error: "Wallet is not active" });
    }
    
    if (wallet.balance < amount) {
      return res.status(400).json({
        error: "Insufficient wallet balance",
        currentBalance: wallet.balance,
        requestedAmount: amount,
        shortfall: amount - wallet.balance
      });
    }
    
    // Calculate fees (you can customize this)
    const platformFee = 0; // No platform fee for now
    const razorpayFee = Math.ceil(amount * 0.005); // 0.5% + GST (approximate)
    const finalAmount = amount - platformFee - razorpayFee;
    
    // Generate unique reference ID
    const referenceId = `WD_${creatorId}_${Date.now()}`;
    
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Create withdrawal record
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
          razorpay_fee: razorpayFee,
          final_amount: finalAmount,
          reference_id: referenceId,
          internal_notes: notes || '',
          requested_at: new Date()
        });
        
        await withdrawal.save({ session });
        
        // Deduct amount from wallet (hold it for withdrawal)
        wallet.balance -= amount;
        wallet.total_withdrawn += amount;
        wallet.last_transaction_at = new Date();
        await wallet.save({ session });
        
        // Create wallet transaction record
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
            bank_account: creator.creator_profile.bank_details.account_number?.slice(-4)
          }
        });
        
        await walletTransaction.save({ session });
        
        // Now initiate Razorpay payout
        try {
          const payout = await razorpay.payouts.create({
            fund_account_id: creator.creator_profile.fund_account_id,
            amount: finalAmount * 100, // Convert to paise
            currency: 'INR',
            mode: 'IMPS', // Can be 'NEFT', 'RTGS', 'IMPS'
            purpose: 'payout',
            queue_if_low_balance: true,
            reference_id: referenceId,
            narration: `Strmly Creator Withdrawal - ${referenceId}`,
            notes: {
              creator_id: creatorId,
              creator_name: creator.username,
              withdrawal_amount: amount,
              platform_fee: platformFee
            }
          });
          
          // Update withdrawal with Razorpay payout ID
          withdrawal.razorpay_payout_id = payout.id;
          withdrawal.status = payout.status; // queued, processing, processed, etc.
          if (payout.status === 'processed') {
            withdrawal.processed_at = new Date();
            withdrawal.utr = payout.utr;
          }
          await withdrawal.save({ session });
          
          // Update wallet transaction status
          walletTransaction.status = 'completed';
          await walletTransaction.save({ session });
          
          console.log('✅ Withdrawal request created and payout initiated:', referenceId);
          
        } catch (payoutError) {
          console.error('❌ Razorpay payout failed:', payoutError);
          
          // Revert wallet balance
          wallet.balance += amount;
          wallet.total_withdrawn -= amount;
          await wallet.save({ session });
          
          // Update withdrawal status
          withdrawal.status = 'failed';
          withdrawal.failure_reason = payoutError.message;
          await withdrawal.save({ session });
          
          // Update wallet transaction
          walletTransaction.status = 'failed';
          await walletTransaction.save({ session });
          
          throw new Error(`Payout initiation failed: ${payoutError.message}`);
        }
      });
      
      // Get updated withdrawal details
      const finalWithdrawal = await Withdrawal.findOne({ reference_id: referenceId })
        .populate('creator_id', 'username email');
      
      res.status(201).json({
        message: "Withdrawal request submitted successfully",
        withdrawal: {
          id: finalWithdrawal._id,
          referenceId: finalWithdrawal.reference_id,
          amount: finalWithdrawal.amount,
          finalAmount: finalWithdrawal.final_amount,
          platformFee: finalWithdrawal.platform_fee,
          razorpayFee: finalWithdrawal.razorpay_fee,
          status: finalWithdrawal.status,
          requestedAt: finalWithdrawal.requested_at,
          processedAt: finalWithdrawal.processed_at,
          bankDetails: {
            accountNumber: finalWithdrawal.bank_details.account_number?.slice(-4),
            ifscCode: finalWithdrawal.bank_details.ifsc_code,
            beneficiaryName: finalWithdrawal.bank_details.beneficiary_name
          }
        },
        wallet: {
          balanceBefore: finalWithdrawal.wallet_balance_before,
          balanceAfter: finalWithdrawal.wallet_balance_after,
          currentBalance: wallet.balance
        },
        timeline: {
          estimatedDelivery: "2-3 business days",
          trackingInfo: finalWithdrawal.razorpay_payout_id ? `Track with ID: ${finalWithdrawal.razorpay_payout_id}` : "Processing..."
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
    
  } catch (error) {
    console.error('❌ Error creating withdrawal request:', error);
    handleError(error, req, res, next);
  }
};

// Get creator's withdrawal history
const getWithdrawalHistory = async (req, res, next) => {
  try {
    const creatorId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    
    // Build filter
    const filter = { creator_id: creatorId };
    if (status) filter.status = status;
    
    const withdrawals = await Withdrawal.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-bank_details.account_number'); // Don't expose full account number
    
    const total = await Withdrawal.countDocuments(filter);
    
    res.status(200).json({
      message: "Withdrawal history retrieved successfully",
      withdrawals: withdrawals.map(wd => ({
        id: wd._id,
        referenceId: wd.reference_id,
        amount: wd.amount,
        finalAmount: wd.final_amount,
        platformFee: wd.platform_fee,
        razorpayFee: wd.razorpay_fee,
        status: wd.status,
        requestedAt: wd.requested_at,
        processedAt: wd.processed_at,
        bankAccount: wd.bank_details?.account_number?.slice(-4),
        ifscCode: wd.bank_details?.ifsc_code,
        utr: wd.utr,
        failureReason: wd.failure_reason
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalWithdrawals: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
      summary: {
        totalWithdrawn: withdrawals.reduce((sum, wd) => wd.status === 'processed' ? sum + wd.final_amount : sum, 0),
        pendingAmount: withdrawals.reduce((sum, wd) => ['pending', 'queued', 'processing'].includes(wd.status) ? sum + wd.amount : sum, 0)
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting withdrawal history:', error);
    handleError(error, req, res, next);
  }
};

// Check withdrawal status
const checkWithdrawalStatus = async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const creatorId = req.user.id;
    
    const withdrawal = await Withdrawal.findOne({
      _id: withdrawalId,
      creator_id: creatorId
    });
    
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }
    
    // If we have Razorpay payout ID, fetch latest status
    if (withdrawal.razorpay_payout_id) {
      try {
        const payout = await razorpay.payouts.fetch(withdrawal.razorpay_payout_id);
        
        // Update status if it has changed
        if (payout.status !== withdrawal.status) {
          withdrawal.status = payout.status;
          if (payout.status === 'processed' && !withdrawal.processed_at) {
            withdrawal.processed_at = new Date();
            withdrawal.utr = payout.utr;
          }
          await withdrawal.save();
        }
        
      } catch (error) {
        console.error('Error fetching payout status:', error);
      }
    }
    
    res.status(200).json({
      message: "Withdrawal status retrieved",
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
        timeline: getWithdrawalTimeline(withdrawal.status)
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking withdrawal status:', error);
    handleError(error, req, res, next);
  }
};

// Helper function to get timeline based on status
const getWithdrawalTimeline = (status) => {
  const timelines = {
    'pending': 'Withdrawal request received, processing...',
    'queued': 'Withdrawal queued, will be processed shortly',
    'processing': 'Payment is being processed by bank',
    'processed': 'Money transferred successfully to your bank account',
    'failed': 'Withdrawal failed, money refunded to wallet',
    'cancelled': 'Withdrawal cancelled, money refunded to wallet'
  };
  
  return timelines[status] || 'Status unknown';
};

module.exports = {
  createWithdrawalRequest,
  getWithdrawalHistory,
  checkWithdrawalStatus,
};