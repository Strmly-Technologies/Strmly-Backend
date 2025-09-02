const Reshare = require('../models/Reshare')
const User = require('../models/User')

const addDetailsToVideoObject = async (videoObject, userId) => {
    const { checkAccess } = require('../controller/recommendation.controller')

  const user = await User.findById(userId).select(
    'following following_communities'
  )
  const is_liked_video = videoObject.liked_by?.some(
    (like) => like.user && like.user._id?.toString() === userId
  )
  videoObject.is_liked_video = is_liked_video

  const is_following_creator =
    user.following?.some(
      (user) => user.toString() === videoObject.created_by?._id?.toString()
    ) || false

  videoObject.is_following_creator = is_following_creator

  const is_following_community =
    user.following_communities?.some(
      (community) =>
        community.toString() === videoObject.community?._id?.toString()
    ) || false
  videoObject.is_following_community = is_following_community
  videoObject = await checkAccess(videoObject, userId)

  const reshare = await Reshare.findOne({
    user: userId,
    long_video: videoObject._id.toString(),
  })
  videoObject.is_reshared =
    reshare && Object.keys(reshare).length > 0 ? true : false

  if (videoObject.videoResolutions) {
    if (videoObject.videoResolutions.variants instanceof Map) {
      videoObject.videoResolutions.variants = Object.fromEntries(videoObject.videoResolutions.variants);
    }
    
    if (!videoObject.videoResolutions.variants || Object.keys(videoObject.videoResolutions.variants).length === 0) {
      if (videoObject.videoResolutions.master && videoObject.videoResolutions.master.url) {
        if (videoObject.videoResolutions.master.type === 'hls') {
          videoObject.videoResolutions.variants = {
            "auto": videoObject.videoResolutions.master.url
          };
        } else {
          videoObject.videoResolutions.variants = {
            "default": videoObject.videoResolutions.master.url
          };
        }
      }
    }
  }
}

module.exports = {
  addDetailsToVideoObject,
}