const {uploadVideoToS3} = require("../utils/utils");

const uploadVideo = async(req, res) => {
  try {
    console.log(" Upload request received:");
    console.log("  - req.videoType:", req.videoType);
    console.log("  - req.file:", req.file ? "Present" : "Missing");
    console.log("  - req.files:", req.files);
    console.log("  - req.body:", req.body);
    console.log("  - Content-Type:", req.headers['content-type']);
    
    const videoType = req.videoType;
    const videoFile = req.file;
    
    if (!videoFile) {
      console.error(" No video file found in request");
      return res.status(400).json({ error: "No video file uploaded" });
    }
    
    if (!videoType) {
      console.error(" No video type found in request");
      return res.status(400).json({ error: "Video type is required. Use ?type=short or ?type=long" });
    }

    console.log("🚀 Starting S3 upload...");
    const uploadResult = await uploadVideoToS3(videoFile, videoType);
    
    if (!uploadResult.success) {
      console.error(" S3 upload failed:", uploadResult);
      return res.status(500).json({ 
        error: uploadResult.message,
        details: uploadResult.error || "Failed to upload video to S3"
      });
    }

    console.log("✅ Video uploaded successfully");
    
    res.status(200).json({
      message: "Video uploaded successfully",
      videoType: videoType,
      videoUrl: uploadResult.url,
      s3Key: uploadResult.key,
      videoName: videoFile.originalname,
      fileSize: videoFile.size,
    });
  } catch (error) {
    console.error("❌ Upload controller error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

module.exports = { uploadVideo };