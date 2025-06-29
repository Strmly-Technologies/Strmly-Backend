const multer = require("multer");
const {s3} = require("../config/AWS")
const { v4: uuidv4 } = require("uuid");

const createVideoMulter = (maxSize) => {
  const storage = multer.memoryStorage();

  const fileFilter = (req, file, cb) => {

    
    const allowedMimeTypes = [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo', 
      'video/x-ms-wmv',  
      'application/octet-stream' 
    ];
    
    const allowedExtensions = ['.mp4', '.avi', '.mov', '.wmv'];
    const fileExtension = file.originalname.toLowerCase().slice(-4);
    
   
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      console.log("✅ File accepted");
      cb(null, true);
    } else {
      console.log("❌ File rejected");
      cb(new Error("Only video files are allowed (MP4, AVI, MOV, WMV)"));
    }
  };

  return multer({
    storage: storage,
    limits: { fileSize: maxSize },
    fileFilter: fileFilter,
  });
};

const dynamicVideoUpload = (req, res, next) => {
  
  const videoType = req.query.type || req.body.type;

  if (!videoType || !["short", "long"].includes(videoType)) {
    console.error("❌ Invalid or missing video type");
    return res.status(400).json({
      error: "Video type is required. Use ?type=short or ?type=long",
    });
  }

  const maxSize = videoType === "short" ? 50 * 1024 * 1024 : 200 * 1024 * 1024;

  req.videoType = videoType;

  const upload = createVideoMulter(maxSize);
  
  upload.single("video")(req, res, (err) => {
    console.log("📋 Multer processing result:");
    console.log("  - Error:", err ? err.message : "None");
    console.log("  - File received:", req.file ? "Yes" : "No");
    console.log("  - Files array:", req.files);
    console.log("  - Body after multer:", req.body);
    
    if (req.file) {
      console.log("  - File details:", {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    }
    
    if (err) {
      console.error(" Multer error:", err.message);
    }
    
    next(err);
  });
};
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: `File too large. Maximum size is ${req.videoType === "short" ? "50MB" : "200MB"}`,
      });
    }
  }
  if (err.message === "Only mp4 files are allowed") {
    return res.status(400).json({ error: "Only MP4 files are allowed" });
  }
  next(err);
};



const uploadVideoToS3=async(file,videoType)=>{
 try {
   const fileExtension=file.originalname.split('.').pop();
   const fileName = `${videoType}/${uuidv4()}.${fileExtension}`;
 
   const uploadParams={
     Bucket: process.env.AWS_S3_BUCKET,
     Key: fileName,
     Body: file.buffer,
     ContentType: file.mimetype,
     ACL:'private', 
     Metadata:{
       'videoType': videoType,
       'originalName': file.originalname,
       'uploadDate':new Date().toISOString(),
     }
   }
 
   const result= await s3.upload(uploadParams).promise();
   return {
     success:true,
     message: "Video uploaded successfully",
     url: result.Location,
     key: result.Key,
     Bucket: result.Bucket,
     videoType: videoType,
   }
 } catch (error) {
    console.error("Error uploading video to S3:", error);
    return {
      success: false,
      message: "Failed to upload video",
      error: error.message,
    };
 }

}



module.exports = {
  handleMulterError,
  createVideoMulter,
  dynamicVideoUpload,
  uploadVideoToS3,
};
