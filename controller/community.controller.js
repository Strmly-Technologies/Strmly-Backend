const Community = require('../models/Community')
const CommunityAccess = require('../models/CommunityAccess')
const { handleError } = require('../utils/utils')

const CreateCommunity = async (req, res, next) => {
  const { name, bio, type, amount, fee_description } = req.body
  const userId = req.user.id

  if (!name) {
    return res.status(400).json({ message: 'Name is required' })
  }
  if (!type || !['free', 'paid'].includes(type)) {
    return res.status(400).json({
      message: 'Community type must be "free" or "paid"',
    })
  }

  try {
    const newCommunity = new Community({
      name,
      bio: bio || '',
      founder: userId,
      followers: [userId],
      community_fee_type: type,
      community_fee_amount: type === 'paid' ? (amount || 0) : 0,
      community_fee_description: type === 'paid' ? (fee_description || '') : '',
    })

    await newCommunity.save()

    res.status(201).json({
      message: 'Community created successfully',
      community: newCommunity,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const RenameCommunity = async (req, res, next) => {
  const { communityId, newName } = req.body
  const userId = req.user.id
  if (!communityId || !newName) {
    return res
      .status(400)
      .json({ message: 'Community ID and new name are required' })
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, founder: userId },
      { name: newName },
      { new: true }
    )

    if (!updatedCommunity) {
      return res
        .status(404)
        .json({ message: 'Community not found or you are not the founder' })
    }

    res.status(200).json({
      message: 'Community renamed successfully',
      community: updatedCommunity,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const ChangeCommunityProfilePhoto = async (req, res, next) => {
  const { communityId, profilePhotoUrl } = req.body
  const userId = req.user.id

  if (!communityId || !profilePhotoUrl) {
    return res
      .status(400)
      .json({ message: 'Community ID and profile photo URL are required' })
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, founder: userId },
      { profile_photo: profilePhotoUrl },
      { new: true }
    )

    if (!updatedCommunity) {
      return res
        .status(404)
        .json({ message: 'Community not found or you are not the founder' })
    }

    res.status(200).json({
      message: 'Community profile photo updated successfully',
      community: updatedCommunity,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const FollowCommunity = async (req, res, next) => {
  const { communityId } = req.body
  const userId = req.user.id

  if (!communityId) {
    return res.status(400).json({ message: 'Community ID is required' })
  }

  try {
    await Community.updateOne(
      { _id: communityId },
      { $addToSet: { followers: userId } }
    )

    res.status(200).json({ message: 'Successfully followed the community' })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const AddBioToCommunity = async (req, res, next) => {
  const { communityId, bio } = req.body
  const userId = req.user.id

  if (!communityId || !bio) {
    return res
      .status(400)
      .json({ message: 'Community ID and bio are required' })
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, founder: userId },
      { bio },
      { new: true }
    )

    if (!updatedCommunity) {
      return res
        .status(404)
        .json({ message: 'Community not found or you are not the founder' })
    }

    res.status(200).json({
      message: 'Bio added to community successfully',
      community: updatedCommunity,
    })
  } catch (error) {
    handleError(error, req, res, next)
  }
}

const checkCommunityUploadPermission = async (userId, communityId) => {
  const community = await Community.findById(communityId)

  if (!community) {
    return { hasPermission: false, error: 'Community not found' }
  }

  // Community founder always has permission
  if (community.founder.toString() === userId) {
    return { hasPermission: true, accessType: 'founder' }
  }
 
  // Check if community is free
  if (community.community_fee_type === 'free') {
    return { hasPermission: true, accessType: 'free' }
  }

  // Check paid access
  const access = await CommunityAccess.findOne({
    user_id: userId,
    community_id: communityId,
    status: 'active',
  })

  if (!access) {
    return {
      hasPermission: false,
      error: 'Upload fee required to upload content',
      requiredFee: community.community_fee_amount,
      communityName: community.name,
    }
  }

  return { hasPermission: true, accessType: 'paid', access }
}

const getAllCommunities = async (req, res, next) => {
  try {
    const communities = await Community.find()
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo');

    if (communities.length === 0) {
      return res.status(404).json({ message: 'No communities found' });
    }
    
    return res.status(200).json({
    communities,
    count: communities.length,
    message: 'Communities fetched successfully'
});
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const getCommunityById = async (req, res,next) => {
  const communityId = req.params.id;
  try {
    const community = await Community.findById(communityId)
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo');
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    return res.status(200).json(community);
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getUserJoinedCommunities = async (req, res, next) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const communities = await Community.find({ followers: userId })
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo');

    return res.status(200).json({
      communities,
      count: communities.length,
      message: communities.length === 0 ? 'No communities found for this user' : 'Communities fetched successfully',
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};



const getUserCreatedCommunities = async (req, res, next) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const communities = await Community.find({ founder: userId })
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo');

    return res.status(200).json({
      communities,
      count: communities.length,
      message:
        communities.length === 0
          ? 'No communities created by this user'
          : 'Communities fetched successfully',
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const getUploadPermissionForCommunity = async (req, res, next) => {
 try {
   const { communityId } = req.body
   const userId = req.user.id
   if (!communityId) {
     return res.status(400).json({ message: 'Community ID is required' })
   }
   const permission = await checkCommunityUploadPermission(userId, communityId)
   if (!permission.hasPermission) {
     return res.status(403).json({
       message: permission.error || 'You do not have permission to upload content',
       requiredFee: permission.requiredFee,
       communityName: permission.communityName,
     })
   }
   return res.status(200).json({
     message: 'You have permission to upload content',
     accessType: permission.accessType,
     access: permission.access || null,
   })
 } catch (error) {
   handleError(error, req, res, next)
 }
}

const getCommunityProfileDetails=async(req,res,next)=>{
  try {
    const communityId=req.params.id
    if (!communityId) {
      return res.status(400).json({ message: 'Community ID is required to proceed' })
    }
    const community = await Community.findById(communityId)
     if (!community) {
      return res.status(404).json({ message: 'Community not found' })
    }
    const totalFollowers = community.followers.length
    const totalCreators = community.creators.length
    const totalVideos = community.long_videos.length + community.short_videos.length + community.series.length
    const totalContent = {
      longVideos: community.long_videos.length,
      shortVideos: community.short_videos.length,
      series: community.series.length,
    }
    return res.status(200).json({
      communityId: community._id,
      name: community.name,
      bio: community.bio,
      profilePhoto: community.profile_photo,
      totalFollowers,
      totalCreators,
      totalVideos,
      totalContent,
      founder: {
        id: community.founder._id,
        username: community.founder.username,
        profilePhoto: community.founder.profile_photo,
      },
    })
    
  } catch (error) {
    handleError(error, req, res, next)
    
  }
}
const getCommunityVideos = async (req, res, next) => {
  try {
    const communityId = req.params.id;
    const { videoType } = req.query;

    if (!communityId) {
      return res.status(400).json({ message: 'Community ID is required' });
    }

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    let videos;

    if (videoType === 'long') {
      const populated = await Community.findById(communityId).populate({
        path: 'long_videos',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
      });
      videos = populated.long_videos;

    } else if (videoType === 'short') {
      const populated = await Community.findById(communityId).populate({
        path: 'short_videos',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
      });
      videos = populated.short_videos;

    } else if (videoType === 'series') {
      const populated = await Community.findById(communityId).populate({
        path: 'series',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
      });
      videos = populated.series;

    } else {
      return res.status(400).json({ message: 'Invalid video type' });
    }

    return res.status(200).json({
      videos,
      count: videos.length,
      message: videos.length === 0 ? 'No videos found in this community' : 'Videos fetched successfully',
    });

  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getTrendingCommunityVideos = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      videoType = 'all', 
      communityId 
    } = req.query;
    
    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    let query = {};
    if (communityId) {
      query.community = communityId;
    }

    let trendingVideos = [];

    if (videoType === 'long' || videoType === 'all') {
      const longVideos = await LongVideo.find(query)
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ likes: -1, views: -1, createdAt: -1 })
        .skip(videoType === 'all' ? 0 : skip)
        .limit(videoType === 'all' ? Math.ceil(limitNum / 2) : limitNum);

      trendingVideos = trendingVideos.concat(
        longVideos.map(video => ({
          ...video.toObject(),
          videoType: 'long'
        }))
      );
    }

    if (videoType === 'short' || videoType === 'all') {
      const shortVideos = await ShortVideo.find(query)
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort({ likes: -1, views: -1, createdAt: -1 })
        .skip(videoType === 'all' ? 0 : skip)
        .limit(videoType === 'all' ? Math.floor(limitNum / 2) : limitNum);

      trendingVideos = trendingVideos.concat(
        shortVideos.map(video => ({
          ...video.toObject(),
          videoType: 'short'
        }))
      );
    }

    // If getting all types, sort combined results and apply pagination
    if (videoType === 'all') {
      trendingVideos.sort((a, b) => {
        if (b.likes !== a.likes) return b.likes - a.likes;
        if (b.views !== a.views) return b.views - a.views;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      trendingVideos = trendingVideos.slice(skip, skip + limitNum);
    }

    // Get total counts for pagination
    const totalLongVideos = await LongVideo.countDocuments(query);
    const totalShortVideos = await ShortVideo.countDocuments(query);
    const totalVideos = totalLongVideos + totalShortVideos;

    res.status(200).json({
      message: 'Trending community videos retrieved successfully',
      videos: trendingVideos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalVideos / limitNum),
        totalVideos,
        limit: limitNum,
        hasMore: parseInt(page) < Math.ceil(totalVideos / limitNum),
      },
      filters: {
        videoType,
        communityId: communityId || 'all',
        sortBy: 'likes_desc',
      },
      stats: {
        totalLongVideos,
        totalShortVideos,
        totalCommunities: communityId ? 1 : await Community.countDocuments(),
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getTrendingVideosByCommunity = async (req, res, next) => {
  try {
    const { id: communityId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      videoType = 'all',
      sortBy = 'likes' 
    } = req.query;
    
    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    // Check if community exists
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    let sortObject = {};
    switch (sortBy) {
      case 'likes':
        sortObject = { likes: -1, views: -1, createdAt: -1 };
        break;
      case 'views':
        sortObject = { views: -1, likes: -1, createdAt: -1 };
        break;
      case 'recent':
        sortObject = { createdAt: -1, likes: -1, views: -1 };
        break;
      default:
        sortObject = { likes: -1, views: -1, createdAt: -1 };
    }

    let trendingVideos = [];

    if (videoType === 'long' || videoType === 'all') {
      const longVideos = await LongVideo.find({ community: communityId })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort(sortObject)
        .skip(videoType === 'all' ? 0 : skip)
        .limit(videoType === 'all' ? Math.ceil(limitNum / 2) : limitNum);

      trendingVideos = trendingVideos.concat(
        longVideos.map(video => ({
          ...video.toObject(),
          videoType: 'long'
        }))
      );
    }

    if (videoType === 'short' || videoType === 'all') {
      const shortVideos = await ShortVideo.find({ community: communityId })
        .populate('created_by', 'username profile_photo')
        .populate('community', 'name profile_photo')
        .sort(sortObject)
        .skip(videoType === 'all' ? 0 : skip)
        .limit(videoType === 'all' ? Math.floor(limitNum / 2) : limitNum);

      trendingVideos = trendingVideos.concat(
        shortVideos.map(video => ({
          ...video.toObject(),
          videoType: 'short'
        }))
      );
    }

    // Sort combined results if getting all types
    if (videoType === 'all') {
      trendingVideos.sort((a, b) => {
        switch (sortBy) {
          case 'views':
            if (b.views !== a.views) return b.views - a.views;
            if (b.likes !== a.likes) return b.likes - a.likes;
            return new Date(b.createdAt) - new Date(a.createdAt);
          case 'recent':
            return new Date(b.createdAt) - new Date(a.createdAt);
          default: // likes
            if (b.likes !== a.likes) return b.likes - a.likes;
            if (b.views !== a.views) return b.views - a.views;
            return new Date(b.createdAt) - new Date(a.createdAt);
        }
      });
      
      trendingVideos = trendingVideos.slice(skip, skip + limitNum);
    }

    // Get totals for this community
    const totalLongVideos = await LongVideo.countDocuments({ community: communityId });
    const totalShortVideos = await ShortVideo.countDocuments({ community: communityId });
    const totalVideos = totalLongVideos + totalShortVideos;

    res.status(200).json({
      message: `Trending videos from ${community.name} retrieved successfully`,
      community: {
        id: community._id,
        name: community.name,
        profilePhoto: community.profile_photo,
        followers: community.followers.length,
      },
      videos: trendingVideos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalVideos / limitNum),
        totalVideos,
        limit: limitNum,
        hasMore: parseInt(page) < Math.ceil(totalVideos / limitNum),
      },
      filters: {
        videoType,
        sortBy,
        communityId,
      },
      stats: {
        totalLongVideos,
        totalShortVideos,
        communityFollowers: community.followers.length,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = {
  getCommunityProfileDetails,
  getAllCommunities,
  getCommunityById,
  getUserJoinedCommunities,
  getUserCreatedCommunities,
  FollowCommunity,
  CreateCommunity,
  RenameCommunity,
  ChangeCommunityProfilePhoto,
  AddBioToCommunity,
  checkCommunityUploadPermission,
  getUploadPermissionForCommunity,
  getTrendingCommunityVideos,
  getTrendingVideosByCommunity,
  getCommunityVideos,
}
