
 const uploadVideo=(req,res)=>{
    try {
        const videoType=req.videoType;
        const videoFile=req.file
        if(!videoFile){
            return res.status(400).json({error:"No video file uploaded"});
        }
        if(!videoType){
            return res.status(400).json({error:"Video type is required. Use ?type=short or ?type=long"});
        }

        // logic to save the video file to S3 storage

        res.status(200).json({
            message:"Video uploaded successfully",
            videoType: videoType,
            videoUrl:"xyz",
            fileSize:videoFile.fileSize
        });
        
    } catch (error) {
        console.error("Error uploading video:", error);
        return res.status(500).json({error:"Internal server error"});
    }

}

module.exports={uploadVideo};

