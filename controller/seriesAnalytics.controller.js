const Series = require('../models/Series')
const WalletTransfer = require('../models/WalletTransfer')
const { handleError } = require('../utils/utils')

const getSeriesAnalytics = async (req, res, next) => {
  try {
    const { id: seriesId } = req.params
    const userId = req.user.id

    const series = await Series.findById(seriesId)
      .populate('created_by', 'username profile_photo')
      .populate('episodes', 'name views likes shares')

    if (!series) {
      return res.status(404).json({ 
        success: false,
        message: 'Series not found' 
      })
    }

    // Check if user is the creator
    if (series.created_by._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Only series creator can view analytics'
      })
    }

    // Get total revenue and purchases
    const revenueStats = await WalletTransfer.aggregate([
      {
        $match: {
          content_id: seriesId,
          transfer_type: 'series_purchase',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total_amount' },
          totalCreatorEarnings: { $sum: '$creator_amount' },
          totalPlatformFees: { $sum: '$platform_amount' },
          totalPurchases: { $sum: 1 }
        }
      }
    ])

    const revenue = revenueStats[0] || {
      totalRevenue: 0,
      totalCreatorEarnings: 0,
      totalPlatformFees: 0,
      totalPurchases: 0
    }

    // Calculate episode statistics
    const episodeStats = series.episodes.reduce((acc, episode) => {
      acc.totalViews += episode.views || 0
      acc.totalLikes += episode.likes || 0
      acc.totalShares += episode.shares || 0
      return acc
    }, { totalViews: 0, totalLikes: 0, totalShares: 0 })

    // Get monthly purchase data
    const monthlyPurchases = await WalletTransfer.aggregate([
      {
        $match: {
          content_id: seriesId,
          transfer_type: 'series_purchase',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' }
          },
          purchases: { $sum: 1 },
          revenue: { $sum: '$total_amount' },
          earnings: { $sum: '$creator_amount' }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      },
      {
        $limit: 12
      }
    ])

    // Calculate engagement rates
    const engagementRate = episodeStats.totalViews > 0 ? 
      Math.round((episodeStats.totalLikes / episodeStats.totalViews) * 100) : 0

    res.status(200).json({
      success: true,
      message: 'Series analytics retrieved successfully',
      series: {
        id: series._id,
        title: series.title,
        type: series.type,
        price: series.price,
        status: series.status,
        totalEpisodes: series.total_episodes,
        creator: series.created_by,
        createdAt: series.createdAt
      },
      analytics: {
        revenue: {
          totalRevenue: revenue.totalRevenue,
          totalCreatorEarnings: revenue.totalCreatorEarnings,
          totalPlatformFees: revenue.totalPlatformFees,
          averageRevenuePerPurchase: revenue.totalPurchases > 0 ? 
            Math.round(revenue.totalRevenue / revenue.totalPurchases) : 0
        },
        purchases: {
          totalPurchases: revenue.totalPurchases,
          followersGainedThroughSeries: series.analytics.followers_gained_through_series,
          conversionMessage: `${revenue.totalPurchases} users became followers through this series`
        },
        episodes: {
          totalEpisodes: series.total_episodes,
          totalViews: episodeStats.totalViews,
          totalLikes: episodeStats.totalLikes,
          totalShares: episodeStats.totalShares,
          averageViewsPerEpisode: series.total_episodes > 0 ? 
            Math.round(episodeStats.totalViews / series.total_episodes) : 0,
          averageLikesPerEpisode: series.total_episodes > 0 ? 
            Math.round(episodeStats.totalLikes / series.total_episodes) : 0
        },
        engagement: {
          engagementRate: engagementRate,
          totalInteractions: episodeStats.totalLikes + episodeStats.totalShares,
          popularityScore: Math.round((episodeStats.totalViews * 0.4) + 
                                    (episodeStats.totalLikes * 0.4) + 
                                    (episodeStats.totalShares * 0.2))
        },
        growth: {
          monthlyData: monthlyPurchases,
          recentTrend: monthlyPurchases.length > 1 ? 
            (monthlyPurchases[0].purchases > monthlyPurchases[1].purchases ? 'increasing' : 'decreasing') : 'stable'
        }
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}
module.exports = {
  getSeriesAnalytics,
}