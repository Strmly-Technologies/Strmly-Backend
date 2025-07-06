const crypto = require("crypto");
const mongoose = require("mongoose");
const razorpay = require("../config/razorpay");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const WalletTransfer = require("../models/WalletTransfer");
const UserAccess = require("../models/UserAccess");
const Series = require("../models/Series");
const User = require("../models/User");
const { handleError } = require("../utils/utils");

const MAX_WALLET_LOAD = 50000;
const MIN_WALLET_LOAD = 0;
const PLATFORM_FEE_PERCENTAGE = 30;
const CREATOR_SHARE_PERCENTAGE = 70;
const MAX_DESCRIPTION_LENGTH = 200;

const generateShortReceipt = (prefix, userId) => {
  const shortUserId = userId.toString().slice(-8);
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substr(2, 4);
  return `${prefix}_${shortUserId}_${timestamp}_${random}`;
};

const validateAmount = (amount, min = MIN_WALLET_LOAD, max = MAX_WALLET_LOAD) => {
  if (!amount || typeof amount !== "number") {
    return { isValid: false, error: "Amount is required and must be a number" };
  }
  if (amount < min) {
    return { isValid: false, error: `Minimum amount is ₹${min}` };
  }
  if (amount > max) {
    return { isValid: false, error: `Maximum amount is ₹${max}` };
  }
  if (amount !== Math.floor(amount)) {
    return { isValid: false, error: "Amount must be a whole number" };
  }
  return { isValid: true };
};

const validateObjectId = (id, fieldName = "ID") => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { isValid: false, error: `Invalid ${fieldName}` };
  }
  return { isValid: true };
};

const sanitizeString = (str, maxLength = 200) => {
  if (!str) return "";
  return str.toString().trim().substring(0, maxLength);
};

const getOrCreateWallet = async (userId, walletType = "user") => {
  const validation = validateObjectId(userId, "User ID");
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  let wallet = await Wallet.findOne({ user_id: userId });

  if (!wallet) {
    wallet = new Wallet({
      user_id: userId,
      balance: 0,
      currency: "INR",
      wallet_type: walletType,
      status: "active",
    });
    await wallet.save();
  }

  return wallet;
};

const createWalletLoadOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      return res.status(400).json({
        error: amountValidation.error,
        code: "INVALID_AMOUNT",
      });
    }

    const userValidation = validateObjectId(userId, "User ID");
    if (!userValidation.isValid) {
      return res.status(400).json({
        error: userValidation.error,
        code: "INVALID_USER_ID",
      });
    }

    const wallet = await getOrCreateWallet(userId, "user");

    if (wallet.status !== "active") {
      return res.status(400).json({
        error: "Wallet is not active. Please contact support.",
        code: "WALLET_INACTIVE",
      });
    }

    const orderOptions = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: generateShortReceipt("WL", userId),
      notes: {
        userId: userId,
        walletId: wallet._id.toString(),
        purpose: "wallet_load",
        wallet_type: "user",
      },
    };

    const razorpayOrder = await razorpay.orders.create(orderOptions);

    res.status(201).json({
      success: true,
      message: "Wallet load order created successfully",
      order: {
        orderId: razorpayOrder.id,
        amount: amount,
        currency: "INR",
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
        currency: "INR",
        name: "Strmly Wallet",
        description: `Load ₹${amount} to your Strmly wallet`,
        prefill: {
          name: req.user.username,
          email: req.user.email,
        },
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const verifyWalletLoad = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const userId = req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Missing required payment verification fields",
        code: "MISSING_PAYMENT_FIELDS",
      });
    }

    if (typeof razorpay_order_id !== "string" || !razorpay_order_id.startsWith("order_")) {
      return res.status(400).json({
        success: false,
        error: "Invalid order ID format",
        code: "INVALID_ORDER_ID",
      });
    }

    if (typeof razorpay_payment_id !== "string" || !razorpay_payment_id.startsWith("pay_")) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment ID format",
        code: "INVALID_PAYMENT_ID",
      });
    }

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Payment verification failed. Invalid signature.",
        code: "SIGNATURE_VERIFICATION_FAILED",
      });
    }

    const existingTransaction = await WalletTransaction.findOne({
      razorpay_payment_id: razorpay_payment_id,
      user_id: userId,
    });

    if (existingTransaction) {
      return res.status(400).json({
        success: false,
        error: "Payment already processed",
        code: "PAYMENT_ALREADY_PROCESSED",
      });
    }

    let payment;
    try {
      payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (razorpayError) {
      return res.status(400).json({
        success: false,
        error: "Failed to verify payment with Razorpay",
        code: "RAZORPAY_VERIFICATION_FAILED",
      });
    }

    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        error: "Payment not captured successfully",
        code: "PAYMENT_NOT_CAPTURED",
      });
    }

    const amount = payment.amount / 100;

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: "INVALID_AMOUNT",
      });
    }

    const wallet = await getOrCreateWallet(userId, "user");
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    const session = await mongoose.startSession();
    let walletTransaction;

    try {
      await session.withTransaction(async () => {
        walletTransaction = new WalletTransaction({
          wallet_id: wallet._id,
          user_id: userId,
          transaction_type: "credit",
          transaction_category: "wallet_load",
          amount: amount,
          currency: "INR",
          description: `Loaded ₹${amount} from bank to wallet`,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          razorpay_payment_id: razorpay_payment_id,
          razorpay_order_id: razorpay_order_id,
          status: "completed",
        });

        await walletTransaction.save({ session });

        wallet.balance = balanceAfter;
        wallet.total_loaded += amount;
        wallet.last_transaction_at = new Date();
        await wallet.save({ session });
      });

      await session.endSession();

      res.status(200).json({
        success: true,
        message: "Wallet loaded successfully!",
        transaction: {
          id: walletTransaction._id,
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          date: new Date(),
          source: "bank_transfer",
        },
        wallet: {
          balance: wallet.balance,
          totalLoaded: wallet.total_loaded,
        },
        nextSteps: {
          message: "You can now transfer money to creators to buy their content",
          availableActions: ["Buy series from creators", "Purchase individual videos", "Send tips to creators"],
        },
      });
    } catch (transactionError) {
      await session.abortTransaction();
      throw transactionError;
    } finally {
      if (session.inTransaction()) {
        await session.endSession();
      }
    }
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const transferToCreatorForSeries = async (req, res, next) => {
  try {
    const { seriesId, amount, transferNote } = req.body;
    const buyerId = req.user.id;

    if (!seriesId || !amount) {
      return res.status(400).json({
        success: false,
        error: "Series ID and amount are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    const seriesValidation = validateObjectId(seriesId, "Series ID");
    if (!seriesValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: seriesValidation.error,
        code: "INVALID_SERIES_ID",
      });
    }

    const amountValidation = validateAmount(amount, 1, 10000);
    if (!amountValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        code: "INVALID_AMOUNT",
      });
    }

    const sanitizedNote = sanitizeString(transferNote, MAX_DESCRIPTION_LENGTH);
    if (transferNote && transferNote.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Transfer note must be less than ${MAX_DESCRIPTION_LENGTH} characters`,
        code: "INVALID_TRANSFER_NOTE",
      });
    }

    const series = await Series.findById(seriesId).populate("created_by", "username email");
    if (!series) {
      return res.status(404).json({
        success: false,
        error: "Series not found",
        code: "SERIES_NOT_FOUND",
      });
    }

    const creatorId = series.created_by._id;

    if (series.type !== "Paid") {
      return res.status(400).json({
        success: false,
        error: "This series is free to watch",
        code: "SERIES_NOT_PAID",
      });
    }

    const existingAccess = await UserAccess.findOne({
      user_id: buyerId,
      content_id: seriesId,
      content_type: "Series",
    });

    if (existingAccess) {
      return res.status(400).json({
        success: false,
        error: "You already have access to this series",
        code: "ALREADY_PURCHASED",
      });
    }

    if (creatorId.toString() === buyerId) {
      return res.status(400).json({
        success: false,
        error: "You cannot buy your own series",
        code: "CANNOT_BUY_OWN_SERIES",
      });
    }

    const buyerWallet = await getOrCreateWallet(buyerId, "user");
    const creatorWallet = await getOrCreateWallet(creatorId, "creator");

    if (buyerWallet.status !== "active") {
      return res.status(400).json({
        success: false,
        error: "Your wallet is not active",
        code: "WALLET_INACTIVE",
      });
    }

    if (buyerWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        error: "Insufficient wallet balance",
        currentBalance: buyerWallet.balance,
        requiredAmount: amount,
        shortfall: amount - buyerWallet.balance,
        suggestion: "Please load more money to your wallet",
        code: "INSUFFICIENT_BALANCE",
      });
    }

    if (creatorWallet.status !== "active") {
      return res.status(400).json({
        success: false,
        error: "Creator's wallet is not active",
        code: "CREATOR_WALLET_INACTIVE",
      });
    }

    const platformAmount = Math.round(amount * (PLATFORM_FEE_PERCENTAGE / 100));
    const creatorAmount = amount - platformAmount;

    const session = await mongoose.startSession();

    const buyerBalanceBefore = buyerWallet.balance;
    const creatorBalanceBefore = creatorWallet.balance;

    try {
      await session.withTransaction(async () => {
        const buyerBalanceAfter = buyerBalanceBefore - amount;
        const creatorBalanceAfter = creatorBalanceBefore + creatorAmount;

        const walletTransfer = new WalletTransfer({
          sender_id: buyerId,
          receiver_id: creatorId,
          sender_wallet_id: buyerWallet._id,
          receiver_wallet_id: creatorWallet._id,
          total_amount: amount,
          creator_amount: creatorAmount,
          platform_amount: platformAmount,
          currency: "INR",
          transfer_type: "series_purchase",
          content_id: seriesId,
          content_type: "series",
          description: `Purchased series: ${series.title}`,
          sender_balance_before: buyerBalanceBefore,
          sender_balance_after: buyerBalanceAfter,
          receiver_balance_before: creatorBalanceBefore,
          receiver_balance_after: creatorBalanceAfter,
          platform_fee_percentage: PLATFORM_FEE_PERCENTAGE,
          creator_share_percentage: CREATOR_SHARE_PERCENTAGE,
          status: "completed",
          metadata: {
            series_title: series.title,
            creator_name: series.created_by.username,
            transfer_note: sanitizedNote,
            commission_calculation: {
              total_amount: amount,
              platform_fee: platformAmount,
              creator_share: creatorAmount,
            },
          },
        });

        await walletTransfer.save({ session });

        buyerWallet.balance = buyerBalanceAfter;
        buyerWallet.total_spent += amount;
        buyerWallet.last_transaction_at = new Date();
        await buyerWallet.save({ session });

        creatorWallet.balance = creatorBalanceAfter;
        creatorWallet.total_received += creatorAmount;
        creatorWallet.last_transaction_at = new Date();
        await creatorWallet.save({ session });

        const buyerTransaction = new WalletTransaction({
          wallet_id: buyerWallet._id,
          user_id: buyerId,
          transaction_type: "debit",
          transaction_category: "series_purchase",
          amount: amount,
          currency: "INR",
          description: `Purchased series: ${series.title} (Total: ₹${amount})`,
          balance_before: buyerBalanceBefore,
          balance_after: buyerBalanceAfter,
          content_id: seriesId,
          content_type: "series",
          status: "completed",
          metadata: {
            series_title: series.title,
            creator_name: series.created_by.username,
            transfer_id: walletTransfer._id,
            platform_fee: platformAmount,
            creator_share: creatorAmount,
          },
        });

        await buyerTransaction.save({ session });

        const creatorTransaction = new WalletTransaction({
          wallet_id: creatorWallet._id,
          user_id: creatorId,
          transaction_type: "credit",
          transaction_category: "creator_earning",
          amount: creatorAmount,
          currency: "INR",
          description: `Received 70% share for series: ${series.title} (₹${creatorAmount} of ₹${amount})`,
          balance_before: creatorBalanceBefore,
          balance_after: creatorBalanceAfter,
          content_id: seriesId,
          content_type: "Series",
          status: "completed",
          metadata: {
            series_title: series.title,
            buyer_name: req.user.username,
            transfer_id: walletTransfer._id,
            total_amount: amount,
            creator_share: creatorAmount,
            platform_fee: platformAmount,
          },
        });

        await creatorTransaction.save({ session });

        const platformTransaction = new WalletTransaction({
          wallet_id: buyerWallet._id,
          user_id: buyerId,
          transaction_type: "debit",
          transaction_category: "platform_commission",
          amount: platformAmount,
          currency: "INR",
          description: `Platform commission (30%) for series: ${series.title}`,
          balance_before: buyerBalanceBefore,
          balance_after: buyerBalanceAfter,
          content_id: seriesId,
          content_type: "Series",
          status: "completed",
          metadata: {
            series_title: series.title,
            buyer_name: req.user.username,
            creator_name: series.created_by.username,
            transfer_id: walletTransfer._id,
            commission_percentage: PLATFORM_FEE_PERCENTAGE,
            commission_type: "platform_fee",
            total_transaction_amount: amount,
            creator_share: creatorAmount,
          },
        });

        await platformTransaction.save({ session });

        const userAccess = new UserAccess({
          user_id: buyerId,
          content_id: seriesId,
          content_type: "series",
          access_type: "paid",
          payment_id: walletTransfer._id,
          payment_method: "wallet_transfer",
          payment_amount: amount,
          granted_at: new Date(),
        });

        await userAccess.save({ session });

        await User.findByIdAndUpdate(creatorId, { $inc: { "creator_profile.total_earned": creatorAmount } }, { session });

        await Series.findByIdAndUpdate(
          seriesId,
          {
            $inc: {
              total_earned: creatorAmount,
              total_revenue: amount,
              platform_commission: platformAmount,
              total_purchases: 1,
            },
          },
          { session }
        );
      });

      await session.endSession();

      res.status(200).json({
        success: true,
        message: "Series purchased successfully with 70/30 split!",
        transfer: {
          totalAmount: amount,
          creatorAmount: creatorAmount,
          platformAmount: platformAmount,
          splitPercentage: `Creator: ${CREATOR_SHARE_PERCENTAGE}%, Platform: ${PLATFORM_FEE_PERCENTAGE}%`,
          from: req.user.username,
          to: series.created_by.username,
          series: series.title,
          transferType: "series_purchase",
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
          sharePercentage: CREATOR_SHARE_PERCENTAGE,
        },
        platform: {
          commissionAmount: platformAmount,
          commissionPercentage: PLATFORM_FEE_PERCENTAGE,
        },
        access: {
          contentId: seriesId,
          contentType: "Series",
          accessType: "paid",
          grantedAt: new Date(),
        },
        nextSteps: {
          message: "You can now watch all episodes of this series",
          seriesId: seriesId,
        },
      });
    } catch (transactionError) {
      await session.abortTransaction();
      throw transactionError;
    } finally {
      if (session.inTransaction()) {
        await session.endSession();
      }
    }
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getWalletDetails = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const userValidation = validateObjectId(userId, "User ID");
    if (!userValidation.isValid) {
      return res.status(400).json({
        error: userValidation.error,
        code: "INVALID_USER_ID",
      });
    }

    const wallet = await getOrCreateWallet(userId, "user");

    const recentTransfers = await WalletTransfer.find({
      $or: [{ sender_id: userId }, { receiver_id: userId }],
    })
      .populate("sender_id", "username")
      .populate("receiver_id", "username")
      .populate("content_id", "title name")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentTransactions = await WalletTransaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("transaction_type transaction_category amount description balance_after createdAt status")
      .lean();

    res.status(200).json({
      success: true,
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
      recentTransfers: recentTransfers.map((transfer) => ({
        id: transfer._id,
        type: transfer.sender_id._id.toString() === userId ? "sent" : "received",
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
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getWalletTransactionHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type, category } = req.query;

    const userValidation = validateObjectId(userId, "User ID");
    if (!userValidation.isValid) {
      return res.status(400).json({
        error: userValidation.error,
        code: "INVALID_USER_ID",
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (pageNum < 1 || pageNum > 1000) {
      return res.status(400).json({
        error: "Page number must be between 1 and 1000",
        code: "INVALID_PAGE_NUMBER",
      });
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: "Limit must be between 1 and 100",
        code: "INVALID_LIMIT",
      });
    }

    const filter = { user_id: userId };

    if (type) {
      if (!["credit", "debit"].includes(type)) {
        return res.status(400).json({
          error: "Transaction type must be 'credit' or 'debit'",
          code: "INVALID_TRANSACTION_TYPE",
        });
      }
      filter.transaction_type = type;
    }

    if (category) {
      const validCategories = ["wallet_load", "series_purchase", "creator_earning", "platform_commission", "withdrawal_request", "refund"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: `Transaction category must be one of: ${validCategories.join(", ")}`,
          code: "INVALID_TRANSACTION_CATEGORY",
        });
      }
      filter.transaction_category = category;
    }

    const transactions = await WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .populate("content_id", "title name")
      .select("-__v")
      .lean();

    const total = await WalletTransaction.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: "Transaction history retrieved successfully",
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
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getGiftHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type = "all" } = req.query;

    const userValidation = validateObjectId(userId, "User ID");
    if (!userValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: userValidation.error,
        code: "INVALID_USER_ID",
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (pageNum < 1 || pageNum > 1000) {
      return res.status(400).json({
        success: false,
        error: "Page number must be between 1 and 1000",
        code: "INVALID_PAGE_NUMBER",
      });
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: "Limit must be between 1 and 100",
        code: "INVALID_LIMIT",
      });
    }

    let filter = {};

    if (type === "sent") {
      filter = { sender_id: userId, transfer_type: "comment_gift" };
    } else if (type === "received") {
      filter = { receiver_id: userId, transfer_type: "comment_gift" };
    } else if (type === "all") {
      filter = { 
        $or: [
          { sender_id: userId, transfer_type: "comment_gift" },
          { receiver_id: userId, transfer_type: "comment_gift" }
        ]
      };
    } else {
      return res.status(400).json({
        success: false,
        error: "Type must be 'sent', 'received', or 'all'",
        code: "INVALID_TYPE",
      });
    }

    const gifts = await WalletTransfer.find(filter)
      .populate("sender_id", "username profilePicture")
      .populate("receiver_id", "username profilePicture")
      .populate("content_id", "name title")
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await WalletTransfer.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: "Gift history retrieved successfully",
      gifts: gifts.map((gift) => ({
        id: gift._id,
        amount: gift.total_amount,
        type: gift.sender_id._id.toString() === userId ? "sent" : "received",
        from: gift.sender_id.username,
        to: gift.receiver_id.username,
        videoTitle: gift.content_id?.name || gift.content_id?.title || "Unknown Video",
        commentPreview: gift.metadata?.comment_text || "",
        giftNote: gift.metadata?.transfer_note || "",
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
        totalSent: gifts.filter(g => g.sender_id._id.toString() === userId).reduce((sum, g) => sum + g.total_amount, 0),
        totalReceived: gifts.filter(g => g.receiver_id._id.toString() === userId).reduce((sum, g) => sum + g.total_amount, 0),
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = {
  getWalletDetails,
  createWalletLoadOrder,
  verifyWalletLoad,
  transferToCreatorForSeries,
  getWalletTransactionHistory,
  getOrCreateWallet,
  getGiftHistory,
};
