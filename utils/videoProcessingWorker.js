const { Worker } = require('bullmq')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { randomUUID } = require('crypto')
const { uploadImageToS3, processVideoMetadata } = require('./utils')
const { s3 } = require('../config/AWS')
const LongVideo = require('../models/LongVideo')

let videoProcessingWorker
const maxRetries = 3
let retryCount = 0

const initializeWorker = async () => {
  try {
    // Create Redis connection config for BullMQ
    const redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
    }

    console.log('✅ Initializing video processing worker...')

    // Create the BullMQ worker
    videoProcessingWorker = new Worker(
      'video-processing',
      async (job) => {
        const { videoId, s3Key, userId } = job.data;
        console.log(`Processing video: ${videoId} from S3 key: ${s3Key}`)
        
        try {
          // Update video status to processing
          await LongVideo.findByIdAndUpdate(videoId, {
            processingStatus: 'processing',
          });
          
          // Download video from S3 to temp storage
          const tempDir = path.join(os.tmpdir(), 'video-processing');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const tempVideoPath = path.join(tempDir, `${randomUUID()}.mp4`);
          const downloadParams = { Bucket: process.env.AWS_S3_BUCKET, Key: s3Key };
          
          console.log(`Downloading video from S3 to ${tempVideoPath}...`)
          const fileStream = s3.getObject(downloadParams).createReadStream();
          const writeStream = fs.createWriteStream(tempVideoPath);
          
          await new Promise((resolve, reject) => {
            fileStream.pipe(writeStream);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
          });
          
          console.log('Video download complete, processing metadata...');
          
          // Process video metadata (thumbnail, duration, keyframes)
          const metadata = await processVideoMetadata(tempVideoPath);
          
          // Upload thumbnail if not already uploaded
          const video = await LongVideo.findById(videoId);
          
          if (!video) {
            throw new Error(`Video with ID ${videoId} not found`);
          }
          
          if (!video.thumbnailUrl) {
            console.log('Generating and uploading thumbnail...');
            const thumbnailResult = await uploadImageToS3(
              `${video.name || 'video'}_thumbnail`,
              'image/png',
              metadata.thumbnail,
              'video_thumbnails'
            );
            
            if (thumbnailResult.success) {
              // Update video with thumbnail info
              video.thumbnailUrl = thumbnailResult.url;
              video.thumbnailS3Key = thumbnailResult.key;
            }
          }
          
          // Update video with duration
          console.log(`Setting video duration: ${metadata.duration}s`);
          video.duration = metadata.duration;
          video.duration_formatted = metadata.durationFormatted;
          
          // Save keyframes as separate objects or references
          console.log(`Processing ${metadata.keyframes.length} keyframes...`);
          const keyframeMap = {};
          for (const frame of metadata.keyframes) {
            const keyframeResult = await uploadImageToS3(
              `${videoId}_keyframe_${frame.position}`,
              'image/jpeg',
              Buffer.from(frame.data, 'base64'),
              'video_keyframes'
            );
            
            if (keyframeResult.success) {
              keyframeMap[frame.position] = {
                url: keyframeResult.url,
                key: keyframeResult.key
              };
            }
          }
          
          // Store keyframe references (optimize to avoid huge document)
          video.keyframes = Object.keys(keyframeMap).map(position => ({
            position: parseInt(position),
            url: keyframeMap[position].url,
            key: keyframeMap[position].key
          }));
          
          // Update processing status
          video.processingStatus = 'completed';
          video.processing_completed_at = new Date();
          
          // Save updated video document
          await video.save();
          
          console.log(`✅ Video ${videoId} processing completed successfully`);
          return { 
            success: true, 
            videoId,
            duration: metadata.duration,
            keyframeCount: metadata.keyframes.length
          };
        } catch (error) {
          console.error('Video processing error:', error);
          // Update video with error status
          await LongVideo.findByIdAndUpdate(videoId, {
            processingError: error.message,
            processingStatus: 'failed'
          });
          throw error;
        }
      },
      {
        connection: redisConnection,
        concurrency: 2, // Process 2 videos at a time (adjust based on server capacity)
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );

    // Event listeners
    videoProcessingWorker.on('completed', (job, result) => {
      console.log(`✅ Video processing job ${job.id} completed:`, result);
      retryCount = 0;
    });

    videoProcessingWorker.on('failed', (job, err) => {
      console.error(
        `❌ Video processing job ${job?.id || 'unknown'} failed:`,
        err.message
      );
    });

    videoProcessingWorker.on('error', (err) => {
      console.error('❌ Video processing worker error:', err.message);

      // Don't restart worker on Redis script errors
      if (!err.message.includes('user_script') && retryCount < maxRetries) {
        retryCount++;
        console.log(
          `⚠️ Restarting worker (attempt ${retryCount}/${maxRetries})...`
        );
        setTimeout(() => {
          initializeWorker();
        }, 5000);
      }
    });

    videoProcessingWorker.on('stalled', (jobId) => {
      console.warn(`⚠️ Job ${jobId} stalled, will be retried`);
    });

    console.log('✅ Video processing worker initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing video processing worker:', error.message);

    if (retryCount < maxRetries) {
      retryCount++;
      console.warn(
        `⚠️ Retrying worker initialization (${retryCount}/${maxRetries}) in 5 seconds...`
      );
      setTimeout(initializeWorker, 5000);
    } else {
      console.error('❌ Max retries reached. Worker initialization failed.');
    }
  }
};

// Start initialization after a delay to ensure Redis is ready
setTimeout(initializeWorker, 5000);

module.exports = {
  getWorker: () => videoProcessingWorker,
  initializeWorker
};