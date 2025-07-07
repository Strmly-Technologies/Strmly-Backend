const Community = require('../models/Community')
const CommunityAccess = require('../models/CommunityAccess')
const { handleError } = require('../utils/utils')

const CreateCommunity = async (req, res, next) => {
  const { name, bio } = req.body
  const userId = req.user.id

  if (!name) {
    return res.status(400).json({ message: 'Name is required' })
  }

  try {
    const newCommunity = new Community({
      name,
      bio: bio || '',
      founder: userId,
      followers: [userId],
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

const getAllCommunities = async () => {
  try {
    const communities = await Community.find().populate('founder', 'username profile_photo')
    .populate('followers', 'username profile_photo')
    .populate('creators', 'username profile_photo')
    const communitiesLength = communities.length
    if (communitiesLength === 0) {
      return { message: 'No communities found' }
    }
    return communities
  } catch (error) {
    throw new Error('Error fetching communities: ' + error.message)
  }
}

const getCommunityById = async (communityId) => {
  try {
    const community = await Community.findById(communityId).populate('founder', 'username profile_photo')
    .populate('followers', 'username profile_photo')
    .populate('creators', 'username profile_photo')
    if (!community) {
      return { message: 'Community not found' }
    }
    return community
  } catch (error) {
    throw new Error('Error fetching community: ' + error.message)
  }
}

const getUserJoinedCommunities = async (userId) => {
  try {
    const communities = await Community.find({ followers: userId })
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo')

    if (communities.length === 0) {
      return { message: 'No communities found for this user' }
    }
    return communities
  }
  catch(error){
    throw new Error('Error fetching user communities: ' + error.message)
  }
}


const getUserCreatedCommunities = async (userId) => {
  try {
    const communities = await Community.find({ founder: userId })
      .populate('founder', 'username profile_photo')
      .populate('followers', 'username profile_photo')
      .populate('creators', 'username profile_photo')

    if (communities.length === 0) {
      return { message: 'No communities created by this user' }
    }
    return communities
  } catch (error) {
    throw new Error('Error fetching user created communities: ' + error.message)
  }
}


module.exports = {
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
}
