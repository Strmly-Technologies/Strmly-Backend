const { checkCreatorPassAccess } = require("../controller/creatorpass.controller")
const UserAccess = require("../models/UserAccess")

const checkAccess = async (video, userId) => {
  console.log('Checking video access for user:', userId)
  try {
    if (video.type === 'Free') {
      video.access = {
        isPlayable: true,
        freeRange: {
          start_time: video.start_time || 0,
          display_till_time: video.display_till_time || 0,
        },
        isPurchased: true,
        accessType: 'free',
      }
    } else if (video.type === 'Paid') {
      // Check if user has creator pass access
      const hasCreatorPass = await checkCreatorPassAccess(
        userId,
        video.created_by._id.toString()
      )

      if (hasCreatorPass.hasAccess) {
        video.access = {
          isPlayable: true,
          freeRange: {
            start_time: video.start_time || 0,
            display_till_time: video.display_till_time || 0,
          },
          isPurchased: true,
          accessType: 'creator_pass',
        }
      } else {
        // Check if user has purchased the video
        const hasPurchasedVideo = await UserAccess.findOne({
          user_id: userId,
          content_id: video._id,
          content_type: 'video',
          access_type: 'paid',
        })

        if (hasPurchasedVideo) {
          video.access = {
            isPlayable: true,
            freeRange: {
              start_time: video.start_time || 0,
              display_till_time: video.display_till_time || 0,
            },
            isPurchased: true,
            accessType: 'purchased',
          }
        } else {
          video.access = {
            isPlayable: false,
            freeRange: {
              start_time: video.start_time || 0,
              display_till_time: video.display_till_time || 0,
            },
            isPurchased: false,
            accessType: 'limited',
            price: video.amount || 0,
          }
        }
      }
    } else {
      // Default access for unknown type
      video.access = {
        isPlayable: false,
        freeRange: {
          start_time: video.start_time || 0,
          display_till_time: video.display_till_time || 0,
        },
        isPurchased: false,
        accessType: 'unknown',
      }
    }

    return video
  } catch (error) {
    console.error('Error checking video access:', error)
    // Return video with limited access if error occurs
    video.access = {
      isPlayable: false,
      freeRange: {
        start_time: video.start_time || 0,
        display_till_time: video.display_till_time || 0,
      },
      isPurchased: false,
      accessType: 'error',
    }
    return video
  }
}

module.exports = {
    checkAccess,
}