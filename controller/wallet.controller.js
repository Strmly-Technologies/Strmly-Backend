const crypto = require('crypto');
const mongoose = require('mongoose');
const razorpay = require('../config/razorpay');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const WalletTransfer = require('../models/WalletTransfer');
const UserAccess = require('../models/UserAccess');
const Series = require('../models/Series');
const User = require('../models/User');
const { handleError } = require('../utils/utils');

const generateShortReceipt = (prefix, userId) => {
  const shortUserId = userId.toString().slice(-8);
  const timestamp = Date.now().toString().slice(-6); 
  return `${prefix}_${shortUserId}_${timestamp}`; 
};

// Get or create wallet for any user (buyer or creator)
const getOrCreateWallet = async (userId, walletType = 'user') => {
  let wallet = await Wallet.findOne({ user_id: userId });
  
  if (!wallet) {
    wallet = new Wallet({
      user_id: userId,
      balance: 0,
      currency: 'INR',
      wallet_type: walletType,
      status: 'active'
    });
    await wallet.save();
    console.log(`✅ New ${walletType} wallet created for user:`, userId);
  }
  
  return wallet;
};

// Load money into user wallet from bank/card
const createWalletLoadOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;
    
    // Validate amount
    if (!amount || amount < 1) {
      return res.status(400).json({
        error: "Invalid amount. Minimum load amount is ₹1"
      });
    }
    
    if (amount > 50000) {
      return res.status(400).json({
        error: "Maximum load amount is ₹50,000"
      });
    }
    
    // Get or create user wallet
    const wallet = await getOrCreateWallet(userId, 'user');
    
    if (wallet.status !== 'active') {
      return res.status(400).json({
        error: "Wallet is not active. Please contact support."
      });
    }
    
    // Create Razorpay order for wallet loading
    const orderOptions = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: generateShortReceipt('WL', userId), // Short receipt ID
      notes: {
        userId: userId,
        walletId: wallet._id.toString(),
        purpose: 'wallet_load',
        wallet_type: 'user'
      }
    };
    
    const razorpayOrder = await razorpay.orders.create(orderOptions);
    
    console.log('✅ Wallet load order created:', razorpayOrder.id);
    
    res.status(201).json({
      message: "Wallet load order created successfully",
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
        amount: amount * 100,
        currency: 'INR',
        name: 'Strmly Wallet',
        description: `Load ₹${amount} to your Strmly wallet`,
        prefill: {
          name: req.user.username,
          email: req.user.email,
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating wallet load order:', error);
    handleError(error, req, res, next);
  }
};

// Verify wallet load payment (money from bank to platform to user wallet)
const verifyWalletLoad = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;
    
    const userId = req.user.id;
    
    // Validate signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    
    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }
    
    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const amount = payment.amount / 100; // Convert from paise to rupees
    
    // Get user wallet
    const wallet = await getOrCreateWallet(userId, 'user');
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;
    
    // Create wallet transaction record
    const walletTransaction = new WalletTransaction({
      wallet_id: wallet._id,
      user_id: userId,
      transaction_type: 'credit',
      transaction_category: 'wallet_load',
      amount: amount,
      currency: 'INR',
      description: `Loaded ₹${amount} from bank to wallet`,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      razorpay_payment_id: razorpay_payment_id,
      razorpay_order_id: razorpay_order_id,
      status: 'completed'
    });
    
    await walletTransaction.save();
    
    // Update wallet balance
    wallet.balance = balanceAfter;
    wallet.total_loaded += amount;
    wallet.last_transaction_at = new Date();
    await wallet.save();
    
    console.log('✅ Wallet loaded successfully:', userId, amount);
    
    res.status(200).json({
      message: "Wallet loaded successfully!",
      transaction: {
        id: walletTransaction._id,
        amount: amount,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        date: walletTransaction.createdAt,
        source: "bank_transfer"
      },
      wallet: {
        balance: wallet.balance,
        totalLoaded: wallet.total_loaded,
      },
      nextSteps: {
        message: "You can now transfer money to creators to buy their content",
        availableActions: [
          "Buy series from creators",
          "Purchase individual videos",
          "Send tips to creators"
        ]
      }
    });
    
  } catch (error) {
    console.error('❌ Error verifying wallet load:', error);
    handleError(error, req, res, next);
  }
};

// Transfer money from user wallet to creator wallet (buy series) with 70/30 split
const transferToCreatorForSeries = async (req, res, next) => {
  try {
    const { seriesId, amount, transferNote } = req.body;
    const buyerId = req.user.id;
    
    // Validate input
    if (!seriesId || !amount) {
      return res.status(400).json({
        error: "Series ID and amount are required"
      });
    }
    
    // Get series and creator details
    const series = await Series.findById(seriesId).populate('created_by', 'username email');
    if (!series) {
      return res.status(404).json({ error: "Series not found" });
    }
    
    const creatorId = series.created_by._id;
    
    if (series.type !== "Paid") {
      return res.status(400).json({ error: "This series is free to watch" });
    }
    
    // Check if user already has access
    const existingAccess = await UserAccess.findOne({
      user_id: buyerId,
      content_id: seriesId,
      content_type: "Series"
    });
    
    if (existingAccess) {
      return res.status(400).json({ error: "You already have access to this series" });
    }
    
    // Check if user is the creator
    if (creatorId.toString() === buyerId) {
      return res.status(400).json({ error: "You cannot buy your own series" });
    }
    
    // Get buyer and creator wallets
    const buyerWallet = await getOrCreateWallet(buyerId, 'user');
    const creatorWallet = await getOrCreateWallet(creatorId, 'creator');
    
    // Check buyer wallet status and balance
    if (buyerWallet.status !== 'active') {
      return res.status(400).json({ error: "Your wallet is not active" });
    }
    
    if (buyerWallet.balance < amount) {
      return res.status(400).json({
        error: "Insufficient wallet balance",
        currentBalance: buyerWallet.balance,
        requiredAmount: amount,
        shortfall: amount - buyerWallet.balance,
        suggestion: "Please load more money to your wallet"
      });
    }
    
    // Check creator wallet status
    if (creatorWallet.status !== 'active') {
      return res.status(400).json({ error: "Creator's wallet is not active" });
    }
    // ✅ CALCULATE 70/30 SPLIT
    const platformFeePercentage = 30;
    const creatorSharePercentage = 70;
    const platformAmount = Math.floor(amount * (platformFeePercentage / 100));
    const creatorAmount = amount - platformAmount;
    
    console.log(`💰 Revenue Split: Total: ₹${amount}, Creator: ₹${creatorAmount} (70%), Platform: ₹${platformAmount} (30%)`);
    
    // Start transaction session for atomic operations
    const session = await mongoose.startSession();
    
    // Store original balances for response
    const buyerBalanceBefore = buyerWallet.balance;
    const creatorBalanceBefore = creatorWallet.balance;
    
    const result = await session.withTransaction(async () => {
      // Calculate balances
      const buyerBalanceAfter = buyerBalanceBefore - amount;
      const creatorBalanceAfter = creatorBalanceBefore + creatorAmount;
      
      // Create wallet transfer record with 70/30 split
      const walletTransfer = new WalletTransfer({
        sender_id: buyerId,
        receiver_id: creatorId,
        sender_wallet_id: buyerWallet._id,
        receiver_wallet_id: creatorWallet._id,
        total_amount: amount,
        creator_amount: creatorAmount,
        platform_amount: platformAmount,
        currency: 'INR',
        transfer_type: 'series_purchase',
        content_id: seriesId,
        content_type: 'series',
        description: `Purchased series: ${series.title}`,
        sender_balance_before: buyerBalanceBefore,
        sender_balance_after: buyerBalanceAfter,
        receiver_balance_before: creatorBalanceBefore,
        receiver_balance_after: creatorBalanceAfter,
        platform_fee_percentage: platformFeePercentage,
        creator_share_percentage: creatorSharePercentage,
        status: 'completed',
        metadata: {
          series_title: series.title,
          creator_name: series.created_by.username,
          transfer_note: transferNote || '',
          commission_calculation: {
            total_amount: amount,
            platform_fee: platformAmount,
            creator_share: creatorAmount,
          }
        }
      });
      
      await walletTransfer.save({ session });
      
      // Update buyer wallet
      buyerWallet.balance = buyerBalanceAfter;
      buyerWallet.total_spent += amount;
      buyerWallet.last_transaction_at = new Date();
      await buyerWallet.save({ session });
      
      // Update creator wallet (only 70% goes to creator wallet)
      creatorWallet.balance = creatorBalanceAfter;
      creatorWallet.total_received += creatorAmount;
      creatorWallet.last_transaction_at = new Date();
      await creatorWallet.save({ session });
      
      // Create buyer's wallet transaction record
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
          platform_fee: platformAmount,
          creator_share: creatorAmount
        }
      });
      
      await buyerTransaction.save({ session });
      
      // Create creator's wallet transaction record (70% share)
      const creatorTransaction = new WalletTransaction({
        wallet_id: creatorWallet._id,
        user_id: creatorId,
        transaction_type: 'credit',
        transaction_category: 'creator_earning',
        amount: creatorAmount,
        currency: 'INR',
        description: `Received 70% share for series: ${series.title} (₹${creatorAmount} of ₹${amount})`,
        balance_before: creatorBalanceBefore,
        balance_after: creatorBalanceAfter,
        content_id: seriesId,
        content_type: 'Series',
        status: 'completed',
        metadata: {
          series_title: series.title,
          buyer_name: req.user.username,
          transfer_id: walletTransfer._id,
          total_amount: amount,
          creator_share: creatorAmount,
          platform_fee: platformAmount
        }
      });
      
      await creatorTransaction.save({ session });
      
    
      const platformTransaction = new WalletTransaction({
        wallet_id: buyerWallet._id, 
        user_id: buyerId,
        transaction_type: 'debit', 
        transaction_category: 'platform_commission',
        amount: platformAmount,
        currency: 'INR',
        description: `Platform commission (30%) for series: ${series.title}`,
        balance_before: buyerBalanceBefore,
        balance_after: buyerBalanceAfter, 
        content_id: seriesId,
        content_type: 'Series',
        status: 'completed',
        metadata: {
          series_title: series.title,
          buyer_name: req.user.username,
          creator_name: series.created_by.username,
          transfer_id: walletTransfer._id,
          commission_percentage: platformFeePercentage,
          commission_type: 'platform_fee',
          total_transaction_amount: amount,
          creator_share: creatorAmount
        }
      });
      
      await platformTransaction.save({ session });
      
      const userAccess = new UserAccess({
      user_id: buyerId,
      content_id: seriesId,
      content_type: 'series', 
      access_type: 'paid',
      payment_id: walletTransfer._id, 
      payment_method: 'wallet_transfer',
      payment_amount: amount,
      granted_at: new Date()
    });
      
      await userAccess.save({ session });
      
      // Update creator's profile earnings (70% share)
      await User.findByIdAndUpdate(
        creatorId,
        { $inc: { 'creator_profile.total_earned': creatorAmount } },
        { session }
      );
      
      // Update series earnings
      await Series.findByIdAndUpdate(
        seriesId,
        { 
          $inc: { 
            total_earned: creatorAmount, // Creator's share
            total_revenue: amount, // Total revenue
            platform_commission: platformAmount, // Platform's commission
            total_purchases: 1
          } 
        },
        { session }
      );
      
      console.log('✅ Wallet transfer completed with 70/30 split:', buyerId, '→', creatorId, `Total: ₹${amount}, Creator: ₹${creatorAmount}, Platform: ₹${platformAmount}`);
      
      return { walletTransfer, buyerTransaction, creatorTransaction, platformTransaction };
    });
    
    // Always end session
    await session.endSession();
    
    res.status(200).json({
      message: "Series purchased successfully with 70/30 split!",
      transfer: {
        totalAmount: amount,
        creatorAmount: creatorAmount,
        platformAmount: platformAmount,
        splitPercentage: `Creator: ${creatorSharePercentage}%, Platform: ${platformFeePercentage}%`,
        from: req.user.username,
        to: series.created_by.username,
        series: series.title,
        transferType: 'series_purchase'
      },
      buyer: {
        balanceBefore: buyerBalanceBefore,
        balanceAfter: buyerWallet.balance,
        currentBalance: buyerWallet.balance
      },
      creator: {
        balanceBefore: creatorBalanceBefore,
        balanceAfter: creatorWallet.balance,
        currentBalance: creatorWallet.balance,
        earnedAmount: creatorAmount,
        sharePercentage: creatorSharePercentage
      },
      platform: {
        commissionAmount: platformAmount,
        commissionPercentage: platformFeePercentage
      },
      access: {
        contentId: seriesId,
        contentType: 'Series',
        accessType: 'paid',
        grantedAt: new Date()
      },
      nextSteps: {
        message: "You can now watch all episodes of this series",
        seriesId: seriesId
      }
    });
    
  } catch (error) {
    console.error('❌ Error transferring to creator wallet:', error);
    handleError(error, req, res, next);
  }
};

// Get wallet details with recent transfers
const getWalletDetails = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const wallet = await getOrCreateWallet(userId, 'user');
    
    // Get recent transfers (sent and received)
    const recentTransfers = await WalletTransfer.find({
      $or: [
        { sender_id: userId },
        { receiver_id: userId }
      ]
    })
    .populate('sender_id', 'username')
    .populate('receiver_id', 'username')
    .populate('content_id', 'title name')
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Get recent wallet transactions
    const recentTransactions = await WalletTransaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('transaction_type transaction_category amount description balance_after createdAt');
    
    res.status(200).json({
      message: "Wallet details retrieved successfully",
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
      recentTransfers: recentTransfers.map(transfer => ({
        id: transfer._id,
        type: transfer.sender_id._id.toString() === userId ? 'sent' : 'received',
        totalAmount: transfer.total_amount,
        creatorAmount: transfer.creator_amount,
        platformAmount: transfer.platform_amount,
        from: transfer.sender_id.username,
        to: transfer.receiver_id.username,
        purpose: transfer.transfer_type,
        contentTitle: transfer.content_id?.title || transfer.content_id?.name,
        description: transfer.description,
        date: transfer.createdAt,
        status: transfer.status
      })),
      recentTransactions: recentTransactions.map(tx => ({
        id: tx._id,
        type: tx.transaction_type,
        category: tx.transaction_category,
        amount: tx.amount,
        description: tx.description,
        balanceAfter: tx.balance_after,
        date: tx.createdAt,
      }))
    });
    
  } catch (error) {
    console.error('❌ Error getting wallet details:', error);
    handleError(error, req, res, next);
  }
};

// Get wallet transaction history
const getWalletTransactionHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type, category } = req.query;
    
    // Build filter
    const filter = { user_id: userId };
    if (type) filter.transaction_type = type;
    if (category) filter.transaction_category = category;
    
    const transactions = await WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('content_id', 'title name')
      .select('-__v');
    
    const total = await WalletTransaction.countDocuments(filter);
    
    res.status(200).json({
      message: "Transaction history retrieved successfully",
      transactions: transactions.map(tx => ({
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
        metadata: tx.metadata
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalTransactions: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting transaction history:', error);
    handleError(error, req, res, next);
  }
};

module.exports = {
  getWalletDetails,
  createWalletLoadOrder,
  verifyWalletLoad,
  transferToCreatorForSeries,
  getWalletTransactionHistory,
  getOrCreateWallet
};