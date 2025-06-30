const { uploadVideoToS3, handleError } = require("../utils/utils");

const uploadVideo = async (req, res, next) => {
  try {
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

    const uploadResult = await uploadVideoToS3(videoFile, videoType);

    if (!uploadResult.success) {
      console.error(" S3 upload failed:", uploadResult);
      return res.status(500).json({
        error: uploadResult.message,
        details: uploadResult.error || "Failed to upload video to S3",
      });
    }

    res.status(200).json({
      message: "Video uploaded successfully",
      videoType: videoType,
      videoUrl: uploadResult.url,
      s3Key: uploadResult.key,
      videoName: videoFile.originalname,
      fileSize: videoFile.size,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

module.exports = { uploadVideo };
