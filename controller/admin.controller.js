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
}
             