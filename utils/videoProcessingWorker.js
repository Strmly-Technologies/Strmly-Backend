const { Worker } = require('bullmq');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { uploadImageToS3, processVideoMetadata } = require('./utils');
const { s3 } = require('../config/AWS');
const { exec } = require('child_process');
const LongVideo = require('../models/LongVideo');

let videoProcessingWorker;
const maxRetries = 3;
let retryCount = 0;

const initializeWorker = async () => {
  try {
    // Redis connection config
    const redisConnection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
    };

    console.log('✅ Initializing video processing worker...');

    // Worker
    videoProcessingWorker = new Worker(
      'video-processing',
      async (job) => {
        const { videoId, s3Key } = job.data;
        console.log(`Processing video: ${videoId} from S3 key: ${s3Key}`);

        try {
          // Update video status
          await LongVideo.findByIdAndUpdate(videoId, {
            processingStatus: 'processing',
          });

          // Temp storage path
          const tempDir = path.join(os.tmpdir(), 'video-processing');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const tempVideoPath = path.join(tempDir, `${randomUUID()}.mp4`);

          // Download video from S3
          console.log(`Downloading video from S3 to ${tempVideoPath}...`);
          const downloadParams = { Bucket: process.env.AWS_S3_BUCKET, Key: s3Key };
          const fileStream = s3.getObject(downloadParams).createReadStream();
          const writeStream = fs.createWriteStream(tempVideoPath);

          await new Promise((resolve, reject) => {
            fileStream.pipe(writeStream);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
          });

          // ✅ Optimize video in-place (overwrite same file)
          console.log('Optimizing video with FFmpeg...');
                  const optimizedPath = tempVideoPath.replace('.mp4', '-optimized.mp4');
        await new Promise((resolve, reject) => {
          exec(
            `ffmpeg -i "${tempVideoPath}" -c:v libx264 -c:a aac -movflags +faststart -preset veryfast -g 48 -keyint_min 48 -sc_threshold 0 -y "${optimizedPath}"`,
            (error, stdout, stderr) => {
              if (error) return reject(error);
              resolve();
            }
          );
        });
        // Replace original with optimized
        fs.renameSync(optimizedPath, tempVideoPath);

          // Upload optimized video back to S3 (overwrite original)
          console.log('Uploading optimized video back to S3...');
          const uploadParams = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: s3Key, // overwrite the same key
            Body: fs.createReadStream(tempVideoPath),
            ContentType: 'video/mp4',
          };
          await s3.upload(uploadParams).promise();
          console.log('✅ Optimized video uploaded to S3');

          // Process metadata from optimized video
          console.log('Processing video metadata...');
          const metadata = await processVideoMetadata(tempVideoPath);

          // Get video record
          const video = await LongVideo.findById(videoId);
          if (!video) throw new Error(`Video with ID ${videoId} not found`);

          // Upload thumbnail if not already set
          if (!video.thumbnailUrl) {
            console.log('Generating and uploading thumbnail...');
            const thumbnailResult = await uploadImageToS3(
              `${video.name || 'video'}_thumbnail`,
              'image/png',
              metadata.thumbnail,
              'video_thumbnails'
            );

            if (thumbnailResult.success) {
              video.thumbnailUrl = thumbnailResult.url;
              video.thumbnailS3Key = thumbnailResult.key;
            }
          }

          // Save duration
          video.duration = metadata.duration;
          video.duration_formatted = metadata.durationFormatted;

          // Save keyframes
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
                key: keyframeResult.key,
              };
            }
          }

          video.keyframes = Object.keys(keyframeMap).map((position) => ({
            position: parseInt(position),
            url: keyframeMap[position].url,
            key: keyframeMap[position].key,
          }));

          // Update processing status
          video.processingStatus = 'completed';
          video.processing_completed_at = new Date();
          await video.save();

          // Cleanup
          fs.unlink(tempVideoPath, () => { });

          console.log(`✅ Video ${videoId} processing completed successfully`);
          return {
            success: true,
            videoId,
            duration: metadata.duration,
            keyframeCount: metadata.keyframes.length,
          };
        } catch (error) {
          console.error('Video processing error:', error);
          await LongVideo.findByIdAndUpdate(videoId, {
            processingError: error.message,
            processingStatus: 'failed',
          });
          throw error;
        }
      },
      {
        connection: redisConnection,
        concurrency: 2,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );

    // Worker events
    videoProcessingWorker.on('completed', (job, result) => {
      console.log(`✅ Video processing job ${job.id} completed:`, result);
      retryCount = 0;
    });

    videoProcessingWorker.on('failed', (job, err) => {
      console.error(`❌ Video processing job ${job?.id || 'unknown'} failed:`, err.message);
    });

    videoProcessingWorker.on('error', (err) => {
      console.error('❌ Video processing worker error:', err.message);
      if (!err.message.includes('user_script') && retryCount < maxRetries) {
        retryCount++;
        console.log(`⚠️ Restarting worker (attempt ${retryCount}/${maxRetries})...`);
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
      console.warn(`⚠️ Retrying worker initialization (${retryCount}/${maxRetries}) in 5 seconds...`);
      setTimeout(initializeWorker, 5000);
    } else {
      console.error('❌ Max retries reached. Worker initialization failed.');
    }
  }
};

// Start after a delay to ensure Redis is ready
setTimeout(initializeWorker, 5000);

module.exports = {
  getWorker: () => videoProcessingWorker,
  initializeWorker,
};
