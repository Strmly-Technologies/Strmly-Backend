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
      return res.status(400).json({ message: 'Community ID is required' })
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
  getUploadPermissionForCommunity
}
