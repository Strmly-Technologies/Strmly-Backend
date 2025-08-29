const Community = require('../models/Community')
const LongVideo = require('../models/LongVideo')
const Series = require('../models/Series')
const WalletTransfer = require('../models/WalletTransfer')
const { handleError } = require('../utils/utils')

const getCommunityAnalytics = async (req, res, next) => {
  try {
    const { id: communityId } = req.params
    const userId = req.user.id

    const community = await Community.findById(communityId).populate(
      'founder',
      'username profile_photo'
    )

    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      })
    }

    // Check if user is founder or community member
    const isFounder = community.founder._id.toString() === userId.toString()
    const isMember = (community.followers && community.followers.includes(userId)) || 
                     (community.creators && community.creators.includes(userId))
    
    if (!isFounder && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Only community members can view analytics',
      })
    }

    // Restrict sensitive data for non-founders
    const canViewRevenue = isFounder

    // Get total followers count with null safety
    const totalFollowers = community.followers ? community.followers.length : 0

    // Get total creators count with null safety
    const totalCreators = community.creators ? community.creators.length : 0

    // Combine queries into a single aggregation pipeline
    const [longVideoStats, seriesStats] = await Promise.all([
      LongVideo.aggregate([
        {
          $match: {
            community: communityId,
            visibility: { $ne: 'hidden' },
          },
        },
        {
          $facet: {
            totalLongVideos: [{ $count: 'count' }],
            stats: [
              {
                $group: {
                  _id: null,
                  totalLikes: { $sum: '$likes' },
                  totalViews: { $sum: '$views' },
                  totalShares: { $sum: '$shares' },
                },
              },
            ],
          },
        },
      ]),
      Series.aggregate([
        { $match: { community: communityId } },
        { $count: 'totalSeries' },
      ]),
    ])

    const totalLongVideos = longVideoStats[0]?.totalLongVideos[0]?.count || 0
    const totalLikes = longVideoStats[0]?.stats[0]?.totalLikes || 0
    const totalViews = longVideoStats[0]?.stats[0]?.totalViews || 0
    const totalShares = longVideoStats[0]?.stats[0]?.totalShares || 0
    const totalSeries = seriesStats[0]?.totalSeries || 0
    const videoStats = {
      totalLikes,
      totalShares,
      totalViews,
      totalLongVideos,
      totalSeries,
    }

    // Get total money earned from community fees
    const communityFeeEarnings = await WalletTransfer.aggregate([
      {
        $match: {
          content_id: communityId,
          transfer_type: 'community_fee',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          totalEarned: { $sum: '$creator_amount' },
          totalFeeCollected: { $sum: '$total_amount' },
          totalTransactions: { $sum: 1 },
        },
      },
    ])

    const feeEarnings = communityFeeEarnings[0] || {
      totalEarned: 0,
      totalFeeCollected: 0,
      totalTransactions: 0,
    }

    // Get content earnings from videos/series in this community
    const contentEarnings = await WalletTransfer.aggregate([
      {
        $lookup: {
          from: 'longvideos',
          localField: 'content_id',
          foreignField: '_id',
          as: 'video',
        },
      },
      {
        $lookup: {
          from: 'series',
          localField: 'content_id',
          foreignField: '_id',
          as: 'series',
        },
      },
      {
        $match: {
          $or: [
            { 'video.community': communityId },
            { 'series.community': communityId },
          ],
          transfer_type: { $in: ['series_purchase', 'video_purchase'] },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          totalContentEarnings: { $sum: '$creator_amount' },
          totalContentRevenue: { $sum: '$total_amount' },
          totalContentSales: { $sum: 1 },
        },
      },
    ])

    const contentStats = contentEarnings[0] || {
      totalContentEarnings: 0,
      totalContentRevenue: 0,
      totalContentSales: 0,
    }

    // Get monthly growth data
    const monthlyGrowth = await getMonthlyGrowthData(communityId)

    // Get top performing content
    const topVideos = await LongVideo.find({
      community: communityId,
      visibility: { $ne: 'hidden' },
    })
      .populate('created_by', 'username')
      .sort({ likes: -1, views: -1 })
      .limit(5)
      .select('name likes views shares created_by')

    const topSeries = await Series.find({
      community: communityId,
    })
      .populate('created_by', 'username')
      .sort({ total_earned: -1 })
      .limit(5)
      .select('title total_earned total_purchases created_by')

    res.status(200).json({
      success: true,
      message: 'Community analytics retrieved successfully',
      community: {
        id: community._id,
        name: community.name,
        founder: community.founder,
        createdAt: community.createdAt,
      },
      analytics: {
        followers: {
          total: totalFollowers,
          growth: monthlyGrowth.followersGrowth,
        },
        creators: {
          total: totalCreators,
          limit: community.creator_limit,
          utilizationPercentage: Math.round(
            (totalCreators / community.creator_limit) * 100
          ),
        },
        content: {
          totalVideos: totalLongVideos,
          totalSeries: totalSeries,
          totalContent: totalLongVideos + totalSeries,
        },
        engagement: {
          totalLikes: videoStats.totalLikes,
          totalViews: videoStats.totalViews,
          totalShares: videoStats.totalShares,
          averageLikesPerVideo:
            totalLongVideos > 0
              ? Math.round(videoStats.totalLikes / totalLongVideos)
              : 0,
        },
        earnings: canViewRevenue ? {
          communityFees: {
            totalEarned: feeEarnings.totalEarned,
            totalCollected: feeEarnings.totalFeeCollected,
            totalTransactions: feeEarnings.totalTransactions,
          },
          contentSales: {
            totalEarnings: contentStats.totalContentEarnings,
            totalRevenue: contentStats.totalContentRevenue,
            totalSales: contentStats.totalContentSales,
          },
          totalEarnings:
            feeEarnings.totalEarned + contentStats.totalContentEarnings,
          totalRevenue:
            feeEarnings.totalFeeCollected + contentStats.totalContentRevenue,
        } : {
          communityFees: {
            totalEarned: 0,
            totalCollected: 0,
            totalTransactions: 0,
          },
          contentSales: {
            totalEarnings: 0,
            totalRevenue: 0,
            totalSales: 0,
          },
          totalEarnings: 0,
          totalRevenue: 0,
        },
        growth: monthlyGrowth,
        topPerforming: {
          videos: topVideos,
          series: topSeries,
        },
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getMonthlyGrowthData = async (communityId) => {
  try {
    const currentDate = new Date()
    const lastMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1
    )
    const thisMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    )

    // Get followers growth
    const community = await Community.findById(communityId)
    const currentFollowers = community && community.followers ? community.followers.length : 0

    // Get content growth
    const thisMonthVideos = await LongVideo.countDocuments({
      community: communityId,
      createdAt: { $gte: thisMonth },
      visibility: { $ne: 'hidden' },
    })

    const lastMonthVideos = await LongVideo.countDocuments({
      community: communityId,
      createdAt: { $gte: lastMonth, $lt: thisMonth },
      visibility: { $ne: 'hidden' },
    })

    const thisMonthSeries = await Series.countDocuments({
      community: communityId,
      createdAt: { $gte: thisMonth },
    })

    const lastMonthSeries = await Series.countDocuments({
      community: communityId,
      createdAt: { $gte: lastMonth, $lt: thisMonth },
    })

    // Get earnings growth
    const thisMonthEarnings = await WalletTransfer.aggregate([
      {
        $match: {
          content_id: communityId,
          transfer_type: 'community_fee',
          status: 'completed',
          createdAt: { $gte: thisMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$creator_amount' },
        },
      },
    ])

    const lastMonthEarnings = await WalletTransfer.aggregate([
      {
        $match: {
          content_id: communityId,
          transfer_type: 'community_fee',
          status: 'completed',
          createdAt: { $gte: lastMonth, $lt: thisMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$creator_amount' },
        },
      },
    ])

    const thisMonthTotal = thisMonthEarnings[0]?.total || 0
    const lastMonthTotal = lastMonthEarnings[0]?.total || 0

    return {
      followersGrowth: {
        current: currentFollowers,
        thisMonth: thisMonthVideos + thisMonthSeries,
        lastMonth: lastMonthVideos + lastMonthSeries,
      },
      contentGrowth: {
        thisMonth: {
          videos: thisMonthVideos,
          series: thisMonthSeries,
          total: thisMonthVideos + thisMonthSeries,
        },
        lastMonth: {
          videos: lastMonthVideos,
          series: lastMonthSeries,
          total: lastMonthVideos + lastMonthSeries,
        },
      },
      earningsGrowth: {
        thisMonth: thisMonthTotal,
        lastMonth: lastMonthTotal,
        growthPercentage:
          lastMonthTotal > 0
            ? Math.round(
                ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
              )
            : 0,
      },
    }
  } catch (error) {
    console.error('Error calculating monthly growth:', error)
    return {
      followersGrowth: { current: 0, thisMonth: 0, lastMonth: 0 },
      contentGrowth: {
        thisMonth: { videos: 0, series: 0, total: 0 },
        lastMonth: { videos: 0, series: 0, total: 0 },
      },
      earningsGrowth: { thisMonth: 0, lastMonth: 0, growthPercentage: 0 },
    }
  }
}

const getCommunityEngagementStats = async (req, res, next) => {
  try {
    const { id: communityId } = req.params
    const { timeframe = '30d' } = req.query
    const userId = req.user.id

    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      })
    }

    const isFounder = community.founder.toString() === userId.toString()
    const isMember = (community.followers && community.followers.includes(userId)) || 
                     (community.creators && community.creators.includes(userId))
    
    if (!isFounder && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Only community members can view engagement stats',
      })
    }

    // Calculate date range based on timeframe
    const now = new Date()
    let startDate
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    // Get engagement data for videos in this timeframe
    const engagementStats = await LongVideo.aggregate([
      {
        $match: {
          community: communityId,
          createdAt: { $gte: startDate },
          visibility: { $ne: 'hidden' },
        },
      },
      {
        $group: {
          _id: null,
          totalVideos: { $sum: 1 },
          totalLikes: { $sum: '$likes' },
          totalViews: { $sum: '$views' },
          totalShares: { $sum: '$shares' },
          averageLikes: { $avg: '$likes' },
          averageViews: { $avg: '$views' },
          averageShares: { $avg: '$shares' },
        },
      },
    ])

    const stats = engagementStats[0] || {
      totalVideos: 0,
      totalLikes: 0,
      totalViews: 0,
      totalShares: 0,
      averageLikes: 0,
      averageViews: 0,
      averageShares: 0,
    }

    res.status(200).json({
      success: true,
      message: 'Community engagement stats retrieved successfully',
      timeframe,
      period: {
        startDate,
        endDate: now,
      },
      engagement: {
        ...stats,
        engagementRate:
          stats.totalViews > 0
            ? Math.round((stats.totalLikes / stats.totalViews) * 100)
            : 0,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getCommunityRevenueBreakdown = async (req, res, next) => {
  try {
    const { id: communityId } = req.params
    const userId = req.user.id

    const community = await Community.findById(communityId)
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found',
      })
    }

    const isFounder = community.founder.toString() === userId.toString()
    
    if (!isFounder) {
      return res.status(403).json({
        success: false,
        message: 'Only community founder can view revenue breakdown',
      })
    }

    // Get community fee revenue breakdown
    const feeRevenue = await WalletTransfer.aggregate([
      {
        $match: {
          content_id: communityId,
          transfer_type: 'community_fee',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' },
          },
          totalAmount: { $sum: '$total_amount' },
          creatorAmount: { $sum: '$creator_amount' },
          platformAmount: { $sum: '$platform_amount' },
          transactionCount: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 },
      },
      {
        $limit: 12,
      },
    ])

    res.status(200).json({
      success: true,
      message: 'Community revenue breakdown retrieved successfully',
      community: {
        id: community._id,
        name: community.name,
        feeType: community.community_fee_type,
        feeAmount: community.community_fee_amount,
      },
      revenue: {
        monthlyBreakdown: feeRevenue,
        summary: {
          totalCollected: community.total_fee_collected,
          totalUploads: community.total_uploads,
          averagePerUpload:
            community.total_uploads > 0
              ? Math.round(
                  community.total_fee_collected / community.total_uploads
                )
              : 0,
        },
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  getCommunityAnalytics,
  getCommunityEngagementStats,
  getCommunityRevenueBreakdown,
}
