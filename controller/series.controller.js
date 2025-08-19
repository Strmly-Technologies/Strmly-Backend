const Series = require('../models/Series')
const LongVideo = require('../models/LongVideo')
const { handleError } = require('../utils/utils')
const { addDetailsToVideoObject } = require('../utils/utils')

const createSeries = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const {
      title,
      description,
      posterUrl,
      bannerUrl,
      genre,
      language,
      age_restriction,
      type,
      price,
      release_date,
      seasons,
      communityId,
      promisedEpisodesCount,
    } = req.body

    if (
      !title ||
      !description ||
      !genre ||
      !language ||
      !type ||
      !promisedEpisodesCount
    ) {
      return res.status(400).json({
        error:
          'Required fields: title, description, genre, language, type, promisedEpisodesCount',
      })
    }
    if (promisedEpisodesCount < 2) {
      return res.status(400).json({
        error:
          'You must promise atleast 2 episodes to the viewers of your series',
      })
    }
    // Validate price based on type
    if (type === 'Paid') {
      if (!price || price <= 0) {
        return res.status(400).json({
          error: 'Paid series must have a price greater than 0',
        })
      }
      if (price > 10000) {
        return res.status(400).json({
          error: 'Series price cannot exceed ₹10,000',
        })
      }
    }

    const seriesPrice = type === 'Paid' ? price : 0

    const series = new Series({
      title,
      description,
      posterUrl,
      bannerUrl: bannerUrl || '',
      genre,
      language,
      age_restriction: age_restriction || false,
      type,
      price: seriesPrice,
      release_date: release_date ? release_date : new Date(),
      seasons: seasons || 1,
      created_by: userId,
      updated_by: userId,
      community: communityId,
      promised_episode_count: promisedEpisodesCount,
    })

    await series.save()

    res.status(201).json({
      message: 'Series created successfully',
      data: series,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getSeriesById = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id.toString()
    const series = await Series.findById(id)
      .lean()
      .populate('created_by', 'username email profile_photo custom_name')
      .populate('community', 'name profile_photo followers')
      .populate({
        path: 'episodes',
        populate: [
          {
            path: 'created_by',
            select: 'username profile_photo custom_name',
          },
          {
            path: 'community',
            select: 'name profile_photo followers',
          },
          {
            path: 'liked_by',
            select: 'username profile_photo',
          },
        ],
        options: {
          sort: { season_number: 1, episode_number: 1 },
        },
      })

    if (!series) {
      return res.status(404).json({ error: 'Series not found' })
    }

    for (let i = 0; i < series.episodes.length; i++) {
      await addDetailsToVideoObject(series.episodes[i], userId)
    }

    // Calculate and update analytics based on current episodes
    if (series.episodes && series.episodes.length > 0) {
      const totalViews = series.episodes.reduce((sum, episode) => sum + (episode.views || 0), 0)
      const totalLikes = series.episodes.reduce((sum, episode) => sum + (episode.likes || 0), 0)
      const totalShares = series.episodes.reduce((sum, episode) => sum + (episode.shares || 0), 0)

      // Update the series analytics if they don't match current totals
      if (!series.analytics) {
        series.analytics = {}
      }
      
      if (series.analytics.total_views !== totalViews || 
          series.analytics.total_likes !== totalLikes || 
          series.analytics.total_shares !== totalShares) {
        
        // Update the database
        await Series.findByIdAndUpdate(id, {
          'analytics.total_views': totalViews,
          'analytics.total_likes': totalLikes,
          'analytics.total_shares': totalShares,
          'analytics.last_analytics_update': new Date()
        })

        // Update the response data
        series.analytics.total_views = totalViews
        series.analytics.total_likes = totalLikes
        series.analytics.total_shares = totalShares
      }
    }

    res.status(200).json({
      message: 'Series retrieved successfully',
      data: series,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getUserSeries = async (req, res, next) => {
  const userId = req.user.id.toString()
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' })
  }
  
  try {
    // Ensure userId is a valid ObjectId
    const mongoose = require('mongoose')
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format' })
    }

    console.log('🔍 Fetching series for user:', userId);
    
    // First get all series for debugging
    const allSeries = await Series.find({ created_by: userId });
    console.log('🔍 All series for user (before filtering):', allSeries.map(s => ({ 
      id: s._id, 
      title: s.title, 
      visibility: s.visibility, 
      hidden_reason: s.hidden_reason 
    })));
    
    const series = await Series.find({ 
      created_by: userId,
      $and: [
        {
          $or: [
            { visibility: { $exists: false } },
            { visibility: { $ne: 'hidden' } }
          ]
        }
      ]
    })
      .populate('created_by', 'username email profile_photo')
      .populate('community', 'name profile_photo')
      .populate({
        path: 'episodes',
        select:
          'name description thumbnailUrl season_number episode_number created_by videoUrl',
        populate: {
          path: 'created_by',
          select: 'username email',
        },
        options: {
          sort: { season_number: 1, episode_number: 1 },
        },
      })
    
    console.log('📊 Found series count:', series.length);
    console.log('📊 Series visibility status:', series.map(s => ({ 
      id: s._id, 
      title: s.title, 
      visibility: s.visibility, 
      hidden_reason: s.hidden_reason 
    })));

    // Return empty array instead of 404 when no series found
    res.status(200).json({
      message: series.length > 0 ? 'User series retrieved successfully' : 'No series found for this user',
      data: series,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const updateSeries = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id.toString()
    const {
      title,
      description,
      posterUrl,
      bannerUrl,
      status,
      seasons,
      price,
      type,
    } = req.body

    const series = await Series.findById(id)
    if (!series) {
      return res.status(404).json({ error: 'Series not found' })
    }

    if (series.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to update this series' })
    }

    const updateData = {
      ...(title && { title }),
      ...(description && { description }),
      ...(posterUrl && { posterUrl }),
      ...(bannerUrl && { bannerUrl }),
      ...(status && { status }),
      ...(seasons && { seasons }),
      updated_by: userId,
    }

    // Handle price and type updates
    if (type !== undefined) {
      updateData.type = type
      if (type === 'Paid') {
        if (!price || price <= 0) {
          return res.status(400).json({
            error: 'Paid series must have a price greater than 0',
          })
        }
        updateData.price = price
      } else {
        updateData.price = 0
      }
    } else if (price !== undefined) {
      if (series.type === 'Paid') {
        if (price <= 0) {
          return res.status(400).json({
            error: 'Paid series must have a price greater than 0',
          })
        }
        updateData.price = price
      }
    }

    const updatedSeries = await Series.findByIdAndUpdate(id, updateData, {
      new: true,
    })

    res.status(200).json({
      message: 'Series updated successfully',
      data: updatedSeries,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const deleteSeries = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id.toString()

    const series = await Series.findById(id)
    if (
      !series ||
      (series.visibility === 'hidden' &&
        series.hidden_reason === 'series_deleted')
    ) {
      return res.status(404).json({ error: 'Series not found' })
    }

    if (series.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this series' })
    }

    await LongVideo.updateMany(
      { series: id },
      {
        $unset: { series: 1 },
        $set: {
          is_standalone: true,
          episode_number: null,
          season_number: 1,
        },
      }
    )

    console.log('🗑️ Marking series as deleted:', id);
    console.log('🗑️ Series before deletion:', { 
      id: series._id, 
      title: series.title, 
      visibility: series.visibility 
    });
    
    // Use findByIdAndUpdate for atomic operation
    const updatedSeries = await Series.findByIdAndUpdate(
      id,
      {
        visibility: 'hidden',
        hidden_reason: 'series_deleted',
        hidden_at: new Date()
      },
      { new: true }
    );
    
    console.log('✅ Series marked as deleted:', { 
      id: updatedSeries._id, 
      visibility: updatedSeries.visibility, 
      hidden_reason: updatedSeries.hidden_reason 
    });

    // Verify the deletion by fetching the series again
    const verificationSeries = await Series.findById(id);
    console.log('🔍 Verification - Series after deletion:', {
      id: verificationSeries._id,
      visibility: verificationSeries.visibility,
      hidden_reason: verificationSeries.hidden_reason
    });

    res.status(200).json({
      message: 'Series deleted successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const addEpisodeToSeries = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id.toString()
    const { videoId, episodeNumber, seasonNumber = 1 } = req.body

    if (!videoId || !episodeNumber) {
      return res
        .status(400)
        .json({ error: 'videoId and episodeNumber are required' })
    }

    const series = await Series.findById(id)
    if (
      !series ||
      (series.visibility === 'hidden' &&
        series.hidden_reason === 'series_deleted')
    ) {
      return res.status(404).json({ error: 'Series not found' })
    }

    if (series.created_by.toString() !== userId.toString()) {
      console.error(
        `User ${userId.toString()} is not authorized to modify series ${id}--> ${series.created_by.toString()}`
      )
      return res
        .status(403)
        .json({ error: 'Not authorized to modify this series' })
    }

    const video = await LongVideo.findById(videoId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' })
    }

    if (video.created_by.toString() !== userId.toString()) {
      console.error(
        `user ${userId.toString()} is not authorized to use video ${videoId} by user ${video.created_by.toString()}`
      )
      return res.status(403).json({ error: 'Not authorized to use this video' })
    }

    const existingEpisode = await LongVideo.findOne({
      series: id,
      season_number: seasonNumber,
      episode_number: episodeNumber,
    })

    if (existingEpisode) {
      return res.status(400).json({
        error: `Episode ${episodeNumber} of season ${seasonNumber} already exists`,
      })
    }

    await LongVideo.findByIdAndUpdate(videoId, {
      series: id,
      episode_number: episodeNumber,
      season_number: seasonNumber,
      is_standalone: false,
    })

    await Series.findByIdAndUpdate(id, {
      $addToSet: { episodes: videoId },
      $inc: {
        total_episodes: 1,
        'analytics.total_likes': video.likes,
        'analytics.total_views': video.views,
        'analytics.total_shares': video.shares,
      },
      $set: { 'analytics.last_analytics_update': new Date() },
    })

    res.status(200).json({
      message: 'Episode added to series successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const removeEpisodeFromSeries = async (req, res, next) => {
  try {
    const { seriesId, episodeId } = req.params
    const userId = req.user.id.toString() // Convert to string for proper comparison

    console.log('🔍 Episode deletion authorization check:');
    console.log('  - User ID:', userId);
    console.log('  - Series ID:', seriesId);
    console.log('  - Episode ID:', episodeId);

    const series = await Series.findById(seriesId)
    if (
      !series ||
      (series.visibility === 'hidden' &&
        series.hidden_reason === 'series_deleted')
    ) {
      return res.status(404).json({ error: 'Series not found' })
    }

    console.log('  - Series creator ID:', series.created_by.toString());
    console.log('  - Authorization match:', series.created_by.toString() === userId);

    if (series.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to modify this series' })
    }

    const video = await LongVideo.findById(episodeId)
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Episode not found' })
    }

    if (video.series.toString() !== seriesId) {
      return res
        .status(400)
        .json({ error: 'Episode does not belong to this series' })
    }

    await LongVideo.findByIdAndUpdate(episodeId, {
      $unset: { series: 1 },
      $set: {
        is_standalone: true,
        episode_number: null,
        season_number: 1,
      },
    })

    await Series.findByIdAndUpdate(seriesId, {
      $pull: { episodes: episodeId },
      $inc: { 
        total_episodes: -1,
        'analytics.total_views': -(video.views || 0),
        'analytics.total_likes': -(video.likes || 0),
        'analytics.total_shares': -(video.shares || 0),
      },
      $set: { 'analytics.last_analytics_update': new Date() },
    })

    res.status(200).json({
      message: 'Episode removed from series successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const searchSeries = async (req, res, next) => {
  try {
    const { query, genre, page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    if (!query && !genre) {
      return res
        .status(400)
        .json({ error: 'Search query or genre is required' })
    }

    let searchCriteria = {}

    if (query) {
      const searchRegex = new RegExp(query, 'i')
      searchCriteria.$or = [
        { title: searchRegex },
        { description: searchRegex },
      ]
    }

    if (genre) {
      searchCriteria.genre = genre
    }

    const series = await Series.find(searchCriteria)
      .populate('created_by', 'username email profile_photo')
      .populate('community', 'name profile_photo')
      .populate({
        path: 'episodes',
        select:
          'name description thumbnailUrl season_number episode_number created_by videoUrl',
        populate: {
          path: 'created_by',
          select: 'username email',
        },
        options: {
          sort: { season_number: 1, episode_number: 1 },
        },
      })

      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })

    const total = await Series.countDocuments(searchCriteria)

    res.status(200).json({
      message: 'Series search results retrieved successfully',
      data: series,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalResults: total,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getAllSeries = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    const series = await Series.find()
      .populate('created_by', 'username email profile_photo')
      .populate('community', 'name profile_photo')
      .populate({
        path: 'episodes',
        select:
          'name description thumbnailUrl season_number episode_number created_by videoUrl',
        populate: {
          path: 'created_by',
          select: 'username email',
        },
        options: {
          sort: { season_number: 1, episode_number: 1 },
        },
      })

      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })

    const total = await Series.countDocuments()

    res.status(200).json({
      message: 'All series retrieved successfully',
      data: series,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalResults: total,
      },
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const recalculateSeriesAnalytics = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id.toString()

    const series = await Series.findById(id).populate('episodes')
    if (!series) {
      return res.status(404).json({ error: 'Series not found' })
    }

    if (series.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to modify this series' })
    }

    // Calculate totals from episodes
    const totalViews = series.episodes.reduce((sum, episode) => sum + (episode.views || 0), 0)
    const totalLikes = series.episodes.reduce((sum, episode) => sum + (episode.likes || 0), 0)
    const totalShares = series.episodes.reduce((sum, episode) => sum + (episode.shares || 0), 0)

    // Update the series analytics
    await Series.findByIdAndUpdate(id, {
      'analytics.total_views': totalViews,
      'analytics.total_likes': totalLikes,
      'analytics.total_shares': totalShares,
      'analytics.last_analytics_update': new Date()
    })

    res.status(200).json({
      message: 'Series analytics recalculated successfully',
      data: {
        total_views: totalViews,
        total_likes: totalLikes,
        total_shares: totalShares
      }
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  getUserSeries,
  createSeries,
  getSeriesById,
  updateSeries,
  deleteSeries,
  addEpisodeToSeries,
  removeEpisodeFromSeries,
  searchSeries,
  getAllSeries,
  recalculateSeriesAnalytics,
}
