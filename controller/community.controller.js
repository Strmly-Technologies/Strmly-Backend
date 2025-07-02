const Community = require("../models/Community");
const { handleError } = require("../utils/utils");

const CreateCommunity = async (req, res, next) => {
  const { name, bio } = req.body;
  const userId = req.user.id;

  if (!name) {
    return res.status(400).json({ message: "Name is required" });
  }

  try {
    const newCommunity = new Community({
      name,
      bio: bio || "",
      founder: userId,
      followers: [userId],
    });

    await newCommunity.save();

    res.status(201).json({ message: "Community created successfully", community: newCommunity });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const RenameCommunity = async (req, res, next) => {
  const { communityId, newName } = req.body;
  const userId = req.user.id;
  if (!communityId || !newName) {
    return res.status(400).json({ message: "Community ID and new name are required" });
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate({ _id: communityId, founder: userId }, { name: newName }, { new: true });

    if (!updatedCommunity) {
      return res.status(404).json({ message: "Community not found or you are not the founder" });
    }

    res.status(200).json({ message: "Community renamed successfully", community: updatedCommunity });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const ChangeCommunityProfilePhoto = async (req, res, next) => {
  const { communityId, profilePhotoUrl } = req.body;
  const userId = req.user.id;

  if (!communityId || !profilePhotoUrl) {
    return res.status(400).json({ message: "Community ID and profile photo URL are required" });
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate(
      { _id: communityId, founder: userId },
      { profile_photo: profilePhotoUrl },
      { new: true }
    );

    if (!updatedCommunity) {
      return res.status(404).json({ message: "Community not found or you are not the founder" });
    }

    res.status(200).json({ message: "Community profile photo updated successfully", community: updatedCommunity });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const FollowCommunity = async (req, res, next) => {
  const { communityId } = req.body;
  const userId = req.user.id;

  if (!communityId) {
    return res.status(400).json({ message: "Community ID is required" });
  }

  try {
    await Community.updateOne({ _id: communityId }, { $addToSet: { followers: userId } });

    res.status(200).json({ message: "Successfully followed the community" });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const AddBioToCommunity = async (req, res, next) => {
  const { communityId, bio } = req.body;
  const userId = req.user.id;

  if (!communityId || !bio) {
    return res.status(400).json({ message: "Community ID and bio are required" });
  }

  try {
    const updatedCommunity = await Community.findOneAndUpdate({ _id: communityId, founder: userId }, { bio }, { new: true });

    if (!updatedCommunity) {
      return res.status(404).json({ message: "Community not found or you are not the founder" });
    }

    res.status(200).json({ message: "Bio added to community successfully", community: updatedCommunity });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = {
  FollowCommunity,
  CreateCommunity,
  RenameCommunity,
  ChangeCommunityProfilePhoto,
  AddBioToCommunity,
};
