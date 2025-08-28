const Series = require('../models/Series')
const Wallet = require('../models/Wallet')
const LongVideo = require('../models/LongVideo')
const { handleError } = require('../utils/utils')
const { addDetailsToVideoObject } = require('../utils/utils')
const mongoose = require('mongoose')
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

    if (!title || !description || !genre || !language || !type) {
      return res.status(400).json({
        error: 'Required fields: title, description, genre, language, type',
      })
    }
    // Validate price based on type
    if (type === 'Paid') {
      if (
        !price ||
        price <= 0 ||
        !promisedEpisodesCount ||
        promisedEpisodesCount < 2
      ) {
        return res.status(400).json({
          error:
            'Paid series must have a price greater than 0 and promised_episode_count of atleast 2',
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
      promised_episode_count: type === 'Paid' ? promisedEpisodesCount : 0,
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
    const { title, description, posterUrl, bannerUrl, status, seasons, type } =
      req.body

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

    // Handle type update
    if (type && type === 'Free') {
      updateData.type = type
      updateData.price = 0
      updateData.promised_episode_count = 0
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
    const userId = req.user.id.toString()

    const series = await Series.findById(seriesId)
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
      $inc: { total_episodes: -1 },
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

const unlockFunds = async (req, res, next) => {
  try {
    const userId = req.user.id.toString()
    const { seriesId } = req.body
    const series = await Series.findById(seriesId).select(
      '_id locked_earnings promised_episode_count type visibility hidden_reason total_episodes'
    )
    const userWallet = await Wallet.findOne({ user_id: userId }).select(
      '_id user_id balance total_received last_transaction_at status'
    )

    if (
      !series ||
      (series.visibility === 'hidden' &&
        series.hidden_reason === 'series_deleted')
    ) {
      return res.status(404).json({ error: 'Series not found' })
    }

    if (!userWallet) {
      return res.status(404).json({ error: 'user wallet not found' })
    }

    if (userWallet.status !== 'active') {
      return res.status(403).json({ error: 'user wallet not active' })
    }

    if (series.locked_earnings === 0) {
      return res.status(400).json({ error: 'no earnings left to unlock' })
    }

    if (
      series.type === 'Paid' &&
      series.total_episodes < series.promised_episode_count
    ) {
      return res
        .status(403)
        .json({ error: 'earnings not eligible for unlocking' })
    }

    const balanceBefore = userWallet.balance
    const amount = series.locked_earnings
    const balanceAfter = userWallet.balance + amount

    const session = await mongoose.startSession()

    try {
      await session.withTransaction(async () => {
        userWallet.balance = balanceAfter
        userWallet.total_received += amount
        userWallet.last_transaction_at = new Date()
        await userWallet.save({ session })
        series.locked_earnings = 0
        await series.save({ session })
      })

      await session.endSession()

      res.status(200).json({
        success: true,
        message: 'funds unlocked successfully!',
        transaction: {
          userId,
          unlocked_funds: amount,
          balanceBefore,
          balanceAfter,
          date: new Date(),
        },
        wallet: {
          id: userWallet._id.toString(),
          balance: userWallet.balance,
          totalReceived: userWallet.total_received,
        },
      })
    } catch (transactionError) {
      await session.abortTransaction()
      throw transactionError
    } finally {
      if (session.inTransaction()) {
        await session.endSession()
      }
    }
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
  unlockFunds,
}
