const ShortVideo = require("../models/ShortVideos");
const User = require("../models/User");
const { uploadVideoToS3, handleError } = require("../utils/utils");
const LongVideo = require("../models/LongVideo"); 

const uploadVideo = async (req, res, next) => {
  try {
    const videoType = req.videoType;
    const videoFile = req.file;
    const userId=req.user.id;
    const {name,description,genre,type,language,age_restriction}=req.body;
    if(!userId) {
      console.error(" User ID not found in request");
      return res.status(400).json({ error: "User ID is required" });
    }
    if (!videoFile) {
      console.error(" No video file found in request");
      return res.status(400).json({ error: "No video file uploaded" });
    }

    if (!videoType) {
      console.error(" No video type found in request");
      return res.status(400).json({ error: "Video type is required. Use ?type=short or ?type=long" });
    }
    const user=await User.findById(userId).select("-password");
    if (!user) {
      console.error(" User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }

    const uploadResult = await uploadVideoToS3(videoFile, videoType);
    if (!uploadResult.success) {
      console.error(" S3 upload failed:", uploadResult);
      return res.status(500).json({
        error: uploadResult.message,
        details: uploadResult.error || "Failed to upload video to S3",
      });
    }
    let savedVideo;
    if(videoType === "short") {
      const shortVideo={
        name:name || videoFile.originalname,
        description:description || "No description provided",
        videoUrl: uploadResult.url,
        created_by: userId,
        updated_by: userId,
      }
      savedVideo=new ShortVideo(shortVideo);
    }
    else if(videoType==="long"){
      const longVideo={
        name:name || videoFile.originalname,
        description:description || "No description provided",
        videoUrl: uploadResult.url,
        created_by: userId,
        updated_by: userId,
        thumbnailUrl:"",
        genre:genre || "Uncategorized",
        type:type || "Free",
        age_restriction: age_restriction === 'true' || age_restriction === true || false,
        language:language || "English",
        subtitles:[]
      }
      savedVideo=new LongVideo(longVideo);
    }
    await savedVideo.save();
    res.status(200).json({
      message: "Video uploaded successfully",
      videoType: videoType,
      
      // S3 Information
      videoUrl: uploadResult.url,
      s3Key: uploadResult.key,
      
      // File Information  
      videoName: videoFile.originalname,
      fileSize: videoFile.size,
      
      videoId: savedVideo._id, 
      
      // Video Details
      videoData: {
        name: savedVideo.name,
        description: savedVideo.description,
        ...(videoType === "long" && {
          genre: savedVideo.genre,
          type: savedVideo.type,
          language: savedVideo.language,
          age_restriction: savedVideo.age_restriction
        })
      },
      nextSteps: {
        message: "Use videoId to add this video to a community",
        endpoint: `/api/v1/community/add-${videoType}-video`,
        requiredFields: ["communityId", "videoId"]
      }
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = { uploadVideo };
