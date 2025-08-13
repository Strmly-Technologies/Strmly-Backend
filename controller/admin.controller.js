const User = require('../models/User')
const WalletTransaction = require('../models/WalletTransaction')
const Payment = require('../models/Payment')
const CreatorPass = require('../models/CreatorPass')
const LongVideo = require('../models/LongVideo')
const Community = require('../models/Community')
const Series = require('../models/Series')
const { handleError } = require('../utils/utils')
const { generateAdminToken, ADMIN_CREDENTIALS } = require('../middleware/adminAuth')
const path = require('path')
const Withdrawal = require('../models/Withdrawal')
const Wallet = require('../models/Wallet')
const { sendEmail } = require('../utils/email')
const WalletTransfer = require('../models/WalletTransfer')

const adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      })
    }

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      const token = generateAdminToken(username)
      
      res.status(200).json({
        success: true,
        message: 'Admin login successful',
        token,
        admin: { username }
      })
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      })
    }
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getAdminDashboard = async (req, res, next) => {
  try {
    const adminPath = path.join(__dirname, '../admin/index.html')
    res.sendFile(adminPath)
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query
    const skip = (page - 1) * limit

    let query = {}
    if (search) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }
    }

    const users = await User.find(query)
      .select('username email createdAt followers my_communities email_verification account_status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    // Get video count for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const videoCount = await LongVideo.countDocuments({ created_by: user._id })
        return {
          ...user.toObject(),
          videoCount
        }
      })
    )

    const totalUsers = await User.countDocuments(query)

    res.status(200).json({
      success: true,
      users: usersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit)
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 100, date = '' } = req.query
    const skip = (page - 1) * limit

    let query = {}
    if (date) {
      const startDate = new Date(date)
      const endDate = new Date(date)
      endDate.setDate(endDate.getDate() + 1)
      
      query.createdAt = {
        $gte: startDate,
        $lt: endDate
      }
    }

    const transactions = await WalletTransaction.find(query)
      .populate('user_id', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const totalTransactions = await WalletTransaction.countDocuments(query)

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalTransactions,
        pages: Math.ceil(totalTransactions / limit)
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 100, date = '' } = req.query
    const skip = (page - 1) * limit

    let query = {}
    if (date) {
      const startDate = new Date(date)
      const endDate = new Date(date)
      endDate.setDate(endDate.getDate() + 1)
      
      query.createdAt = {
        $gte: startDate,
        $lt: endDate
      }
    }

    const payments = await Payment.find(query)
      .populate('paid_by', 'username email')
      .populate('paid_to', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const totalPayments = await Payment.countDocuments(query)

    res.status(200).json({
      success: true,
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalPayments,
        pages: Math.ceil(totalPayments / limit)
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getSignedUpUsersOnDate=async(req,res,next)=>{
    try {
        const { page = 1, limit = 100, date = '' } = req.query
        const skip = (page - 1) * limit
        let query = {}
        if (date) {
            const startDate = new Date(date)
            const endDate = new Date(date)
            endDate.setDate(endDate.getDate() + 1)
            
            query.createdAt = {
                $gte: startDate,
                $lt: endDate
            }
        }
        const users = await User.find(query)
            .select('username email createdAt followers my_communities email_verification account_status')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
        const totalUsers = await User.countDocuments(query)
        res.status(200).json({
            success: true,
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalUsers,
                pages: Math.ceil(totalUsers / limit)
            }
        })
        
    } catch (error) {
        handleError(error, req, res, next)
        
    }
}

const getCreatorPasses = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query
    const skip = (page - 1) * limit

    let query = {}
    if (search) {
      const users = await User.find({
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id')
      
      const userIds = users.map(user => user._id)
      query = {
        $or: [
          { user_id: { $in: userIds } },
          { creator_id: { $in: userIds } }
        ]
      }
    }

    const creatorPasses = await CreatorPass.find(query)
      .populate('user_id', 'username email')
      .populate('creator_id', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const totalPasses = await CreatorPass.countDocuments(query)

    res.status(200).json({
      success: true,
      creatorPasses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalPasses,
        pages: Math.ceil(totalPasses / limit)
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalTransactions,
      totalPayments,
      totalCreatorPasses,
      totalVideos,
      totalCommunities,
      activeUsers,
      totalRevenue
    ] = await Promise.all([
      User.countDocuments(),
      WalletTransaction.countDocuments(),
      Payment.countDocuments(),
      CreatorPass.countDocuments(),
      LongVideo.countDocuments(),
      Community.countDocuments(),
      User.countDocuments({ 'account_status.is_deactivated': { $ne: true } }),
      WalletTransaction.aggregate([
        { $match: { transaction_type: 'credit' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ])

    const stats = {
      totalUsers,
      activeUsers,
      totalVideos,
      totalCommunities,
      totalTransactions,
      totalPayments,
      totalCreatorPasses,
      totalRevenue: totalRevenue[0]?.total || 0
    }

    res.status(200).json({
      success: true,
      stats
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getReports=async(req,res,next)=>{
    try {
         const { page = 1, limit = 50, status = 'all', content_type = 'all', reason = 'all' } = req.query
         const skip = (page - 1) * limit
         let query = {}
            if (status !== 'all') {
                query.status = status
            }
            if (content_type !== 'all') {
                query.content_type = content_type
            }
            if (reason !== 'all') {
                query.reason = reason
            }
            const reports = await Report.find(query)
            .populate('reporter_id', 'username email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            const totalReports = await Report.countDocuments(query)

           const reportsWithContent = await Promise.all(
      reports.map(async (report) => {
        let contentDetails = null
        try {
          switch (report.content_type) {
            case 'video':
              contentDetails = await LongVideo.findById(report.content_id)
                .select('name description thumbnailUrl created_by')
                .populate('created_by', 'username')
              break
            case 'comment':
              contentDetails = await Comment.findById(report.content_id)
                .select('content user video_id')
                .populate('user', 'username')
              break
            case 'community':
              contentDetails = await Community.findById(report.content_id)
                .select('name bio profile_photo founder')
                .populate('founder', 'username')
              break
            case 'series':
              contentDetails = await Series.findById(report.content_id)
                .select('title description posterUrl created_by')
                .populate('created_by', 'username')
              break
            case 'user':
              contentDetails = await User.findById(report.content_id)
                .select('username email profile_photo account_status')
              break
          }
        } catch (err) {
          console.error(`Error fetching ${report.content_type} details:`, err)
        }

        return {
          ...report.toObject(),
          content_details: contentDetails
        }
      })
    )
  res.status(200).json({
      success: true,
      reports: reportsWithContent,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalReports,
        pages: Math.ceil(totalReports / limit)
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const updateReportStatus=async(req,res,next)=>{
    try {
        const {id}=req.params
        const{status,admin_notes,action_taken,reviewed_by}=req.body
        if (!status || !action_taken) {
            return res.status(400).json({
                success: false,
                message: 'Status and action taken are required'
            })
        }
        const validStauses = ['pending', 'reviewed', 'resolved', 'dismissed']
        if(!validStauses.includes(status)){
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            })
        }
        const validActions = ['none', 'warning', 'content_removed', 'user_suspended', 'user_banned']
        if(!validActions.includes(action_taken)){
            return res.status(400).json({
                success: false,
                message: 'Invalid action taken'
            })
        }
        const report = await Report.findByIdAndUpdate(
            id,
            {status, admin_notes, action_taken, reviewed_by, reviewed_at: new Date()},
            { new: true }
        )
        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            })
        }
        res.status(200).json({
            success: true,
            message: 'Report status updated successfully',
            report
        })

    } catch (error) {
        handleError(error, req, res, next)
    }
}

const getTotalWalletLoad=async(req,res,next)=>{
  try {
    const {page = 1, limit = 100, date = ''} = req.query
    const skip = (page - 1) * limit
    let query = {}
    if (date) {
      const startDate = new Date(date)
      const endDate = new Date(date)
      endDate.setDate(endDate.getDate() + 1)
      
      query.createdAt = {
        $gte: startDate,
        $lt: endDate
      }
    }
    query.transaction_category='wallet_load'
    const transactions=await WalletTransaction.find(query)
      .populate('user_id', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
    const totalTransactions = await WalletTransaction.countDocuments(query)
    let sum=0;
     transactions.forEach((transaction) => {
      sum += Number(transaction.amount)
    })
    console.log('Total wallet load:', sum)

    res.status(200).json({
      success: true,
      transactions,
      totalMoney: sum,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalTransactions,
        pages: Math.ceil(totalTransactions / limit)
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getWithdrawals = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status = 'all', 
      manual = 'all',
      search = '' 
    } = req.query
    
    const skip = (page - 1) * limit

    let query = {}
    
    // Filter by status
    if (status !== 'all') {
      query.status = status
    }
    
    // Filter by manual withdrawals
    if (manual === 'true') {
      query.internal_notes = { $regex: 'MANUAL_WITHDRAWAL', $options: 'i' }
    } else if (manual === 'false') {
      query.internal_notes = { $not: { $regex: 'MANUAL_WITHDRAWAL', $options: 'i' } }
    }

    // Search by creator username or reference ID
    if (search) {
      const users = await User.find({
        username: { $regex: search, $options: 'i' }
      }).select('_id')
      
      const userIds = users.map(user => user._id)
      query = {
        ...query,
        $or: [
          { creator_id: { $in: userIds } },
          { reference_id: { $regex: search, $options: 'i' } }
        ]
      }
    }

    const withdrawals = await Withdrawal.find(query)
      .populate('creator_id', 'username email creator_profile.bank_details creator_profile.upi_id')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const totalWithdrawals = await Withdrawal.countDocuments(query)

    const withdrawalsWithDetails = withdrawals.map(withdrawal => ({
      id: withdrawal._id,
      referenceId: withdrawal.reference_id,
      creator: {
        id: withdrawal.creator_id._id,
        username: withdrawal.creator_id.username,
        email: withdrawal.creator_id.email,
      },
      amount: withdrawal.amount,
      finalAmount: withdrawal.final_amount,
      platformFee: withdrawal.platform_fee,
      status: withdrawal.status,
      manual: /MANUAL_WITHDRAWAL/i.test(withdrawal.internal_notes || ''),
      payoutMethod: withdrawal.upi_id ? 'UPI' : 'Bank Account',
      bankDetails: withdrawal.bank_details ? {
        accountNumber: withdrawal.bank_details.account_number?.slice(-4),
        ifscCode: withdrawal.bank_details.ifsc_code,
        beneficiaryName: withdrawal.bank_details.beneficiary_name,
      } : null,
      upiId: withdrawal.upi_id,
      requestedAt: withdrawal.requested_at,
      processedAt: withdrawal.processed_at,
      utr: withdrawal.utr,
      failureReason: withdrawal.failure_reason,
      notes: withdrawal.internal_notes,
    }))

    res.status(200).json({
      success: true,
      withdrawals: withdrawalsWithDetails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalWithdrawals,
        pages: Math.ceil(totalWithdrawals / limit)
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const processManualWithdrawal = async (req, res, next) => {
  try {
    const { id } = req.params
    const { action = 'process', utr, adminNotes } = req.body

    if (!['process', 'fail'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'process' or 'fail'"
      })
    }

    const withdrawal = await Withdrawal.findById(id).populate('creator_id', 'username email')
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      })
    }

    // Check if it's a manual withdrawal
    if (!/MANUAL_WITHDRAWAL/i.test(withdrawal.internal_notes || '')) {
      return res.status(400).json({
        success: false,
        message: 'This is not a manual withdrawal request'
      })
    }

    if (!['pending', 'processing'].includes(withdrawal.status)) {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal is not in a processable state'
      })
    }

    if (action === 'process') {
      // Mark as processed
      withdrawal.status = 'processed'
      withdrawal.processed_at = new Date()
      if (utr) withdrawal.utr = utr
      
      const updatedNotes = `${withdrawal.internal_notes}\n[ADMIN_PROCESSED] ${adminNotes || 'Manually processed by admin'}`.trim()
      withdrawal.internal_notes = updatedNotes
      
      await withdrawal.save()

      // Update related wallet transaction
      await WalletTransaction.updateMany(
        { 'metadata.withdrawal_id': withdrawal._id },
        { status: 'processed' }
      )

      // Send success email to user
      try {
        await sendEmail(
          withdrawal.creator_id.email,
          'Withdrawal Processed Successfully',
          `Hi ${withdrawal.creator_id.username},

Your withdrawal request has been processed successfully!

Reference ID: ${withdrawal.reference_id}
Amount: ₹${withdrawal.final_amount}
${utr ? `UTR/Transaction ID: ${utr}` : ''}

The money has been transferred to your registered account.

Regards,
Strmly Team`
        )
      } catch (emailError) {
        console.error('Email send failed:', emailError.message)
      }

      return res.status(200).json({
        success: true,
        message: 'Withdrawal marked as processed successfully',
        withdrawal: {
          id: withdrawal._id,
          status: withdrawal.status,
          processedAt: withdrawal.processed_at,
          utr: withdrawal.utr,
        }
      })

    } else if (action === 'fail') {
      // Mark as failed and refund
      withdrawal.status = 'failed'
      withdrawal.failure_reason = adminNotes || 'Marked as failed by admin'
      
      const updatedNotes = `${withdrawal.internal_notes}\n[ADMIN_FAILED] ${adminNotes || 'Manually failed by admin'}`.trim()
      withdrawal.internal_notes = updatedNotes
      
      await withdrawal.save()

      // Refund the wallet
      const wallet = await Wallet.findById(withdrawal.wallet_id)
      if (wallet) {
        const balanceBefore = wallet.balance
        wallet.balance += withdrawal.amount
        wallet.total_withdrawn -= withdrawal.amount
        await wallet.save()

        // Create refund transaction
        const refundTransaction = new WalletTransaction({
          wallet_id: wallet._id,
          user_id: withdrawal.creator_id,
          transaction_type: 'credit',
          transaction_category: 'refund',
          amount: withdrawal.amount,
          currency: 'INR',
          description: `Refund for failed withdrawal: ${withdrawal.reference_id}`,
          balance_before: balanceBefore,
          balance_after: wallet.balance,
          status: 'completed',
          metadata: {
            withdrawal_id: withdrawal._id,
            manual: true,
            refund_reason: 'manual_withdrawal_failed',
            admin_notes: adminNotes,
          },
        })

        await refundTransaction.save()
      }

      // Update original wallet transaction
      await WalletTransaction.updateMany(
        { 'metadata.withdrawal_id': withdrawal._id },
        { status: 'failed' }
      )

      // Send failure email to user
      try {
        await sendEmail(
          withdrawal.creator_id.email,
          'Withdrawal Request Failed - Amount Refunded',
          `Hi ${withdrawal.creator_id.username},

Unfortunately, your withdrawal request could not be processed and has been marked as failed.

Reference ID: ${withdrawal.reference_id}
Amount: ₹${withdrawal.amount}
Reason: ${withdrawal.failure_reason}

The full amount has been refunded back to your wallet and is available for use.

If you have any questions, please contact our support team.

Regards,
Strmly Team`
        )
      } catch (emailError) {
        console.error('Email send failed:', emailError.message)
      }

      return res.status(200).json({
        success: true,
        message: 'Withdrawal marked as failed and amount refunded to wallet',
        withdrawal: {
          id: withdrawal._id,
          status: withdrawal.status,
          failureReason: withdrawal.failure_reason,
        }
      })
    }

  } catch (error) {
    handleError(error, req, res, next)
  }
}



module.exports = {
  adminLogin,
  getAdminDashboard,
  getUsers,
  getTransactions,
  getPayments,
  getCreatorPasses,
  getStats,
  getSignedUpUsersOnDate,
  getReports,
  updateReportStatus,
  getTotalWalletLoad,
  getWithdrawals,
  processManualWithdrawal,
}
