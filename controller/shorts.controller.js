const ShortVideo = require('../models/ShortVideos')
const { handleError } = require('../utils/utils')

const getShortVideosFeed = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query
    const skip = (page - 1) * limit

    const shortVideos = await ShortVideo.find()
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .sort({ createdAt: -1, views: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await ShortVideo.countDocuments()

    res.status(200).json({
      message: 'Short videos feed retrieved successfully',
      data: shortVideos,
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

const getShortVideoById = async (req, res, next) => {
  try {
    const { id } = req.params

    const shortVideo = await ShortVideo.findById(id)
      .populate('created_by', 'username email')
      .populate('community', 'name')

    if (!shortVideo) {
      return res.status(404).json({ error: 'Short video not found' })
    }

    res.status(200).json({
      message: 'Short video retrieved successfully',
      data: shortVideo,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const updateShortVideo = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const { name, description } = req.body

    const shortVideo = await ShortVideo.findById(id)
    if (!shortVideo) {
      return res.status(404).json({ error: 'Short video not found' })
    }

    if (shortVideo.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to update this video' })
    }

    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      updated_by: userId,
    }

    const updatedVideo = await ShortVideo.findByIdAndUpdate(id, updateData, {
      new: true,
    })

    res.status(200).json({
      message: 'Short video updated successfully',
      data: updatedVideo,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const deleteShortVideo = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const shortVideo = await ShortVideo.findById(id)
    if (!shortVideo) {
      return res.status(404).json({ error: 'Short video not found' })
    }

    if (shortVideo.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this video' })
    }

    await ShortVideo.findByIdAndDelete(id)

    res.status(200).json({
      message: 'Short video deleted successfully',
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const getTrendingShorts = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query

    const trendingShorts = await ShortVideo.find()
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .sort({ views: -1, likes: -1, createdAt: -1 })
      .limit(parseInt(limit))

    res.status(200).json({
      message: 'Trending shorts retrieved successfully',
      data: trendingShorts,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

module.exports = {
  getShortVideosFeed,
  getShortVideoById,
  updateShortVideo,
  deleteShortVideo,
  getTrendingShorts,
}
