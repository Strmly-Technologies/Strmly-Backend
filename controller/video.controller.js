const User = require('../models/User');
const Community = require('../models/Community');
const { s3 } = require('../config/AWS');
const {
  uploadVideoToS3,
  handleError,
  generateVideoThumbnail,
  uploadImageToS3,
  getFileFromS3Url,
  generatePresignedUploadUrl,
} = require('../utils/utils');
const { addDetailsToVideoObject } = require('../utils/populateVideo');
const { checkCommunityUploadPermission } = require('./community.controller');
const LongVideo = require('../models/LongVideo');
const addVideoToStream = require('../utils/video_queue');
const WalletTransaction = require('../models/WalletTransaction');
const path = require('path');
const os = require('os');
const videoCompressor = require('../utils/video_compressor');
const { generateVideoABSSegments } = require('../utils/ABS');

const fs = require('fs');
const Series = require('../models/Series');
const { randomUUID } = require('crypto');
const { addVideoToProcessingQueue } = require('../utils/videoProcessingQueue');
const { checkAccess } = require('./recommendation.controller');
const { default: mongoose } = require('mongoose');


const getUploadUrl = async (req, res, next) => {
  try {
    const { fileName, contentType, fileSize } = req.body;
    const userId = req.user.id.toString();
    if (!fileName || !contentType || !fileSize) {
      return res.status(400).json({ error: 'fileName, contentType and fileSize are required' });
    }
    const result = await generatePresignedUploadUrl(fileName, fileSize, contentType, userId);
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to generate upload URL' });
    }
    res.status(200).json({
      uploadUrl: result.uploadUrl,
      message: 'Use this URL to upload the video directly to S3 using PUT request',
      s3Key: result.s3Key,
      expiresIn: result.expiresIn
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const processUploadedVideo = async (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const {
      s3Key,
      name,
      description,
      genre,
      type,
      language,
      age_restriction,
      communityId,
      seriesId,
      is_standalone,
      episodeNumber,
      amount,
      start_time,
      display_till_time
    } = req.body;
    const thumbnailFile = req.file;

    if (!s3Key) {
      return res.status(400).json({ error: 's3Key is required' });
    }

    // Validation
    if (!is_standalone) {
      return res.status(400).json({ error: 'is_standalone field required' });
    }
    console.log('passed is_standalone check..');

    if (is_standalone === 'false' && (!episodeNumber || !seriesId)) {
      return res.status(400).json({
        error: 'episodeNumber and seriesId required for non-standalone videos',
      });
    }
    console.log('passed is_standalone');

    if (type === 'Paid') {
      const numericAmount = parseFloat(amount);
      if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({
          error:
            'Amount has to be included and should be greater than 0 for paid videos',
        });
      }
    }

    // Check community permissions if applicable
    if (communityId) {
      const permissionCheck = await checkCommunityUploadPermission(
        userId,
        communityId
      );
      if (!permissionCheck.hasPermission) {
        return res.status(403).json({
          error: permissionCheck.error,
          requiredFee: permissionCheck.requiredFee,
          communityName: permissionCheck.communityName,
        });
      }

      if (permissionCheck.accessType !== 'founder') {
        const community = await Community.findById(communityId);
        if (!community.followers.includes(userId)) {
          return res.status(403).json({
            error: 'You must follow the community to upload videos',
          });
        }
      }
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const videoUrl = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${s3Key}`;

    let thumbnailUploadResult;

    if (thumbnailFile) {
      // If thumbnail is provided, upload it directly to S3
      thumbnailUploadResult = await uploadImageToS3(
        `${name || 'video'}_thumbnail`,
        thumbnailFile.mimetype,
        thumbnailFile.buffer,
        'video_thumbnails'
      );

      if (!thumbnailUploadResult.success) {
        return res.status(500).json({ message: 'Failed to upload thumbnail' });
      }
    } else {
      thumbnailUploadResult = {
        url: null,
        key: null,
        success: true
      };
    }
    // // Download the video into temp folder
    // const tempDir = path.join(os.tmpdir(), 'video-processing')
    // if (!fs.existsSync(tempDir)) {
    //   fs.mkdirSync(tempDir, { recursive: true })
    // }
    // const tempVideoPath = path.join(tempDir, `${randomUUID()}.mp4`)
    // const downloadParams = { Bucket: process.env.AWS_S3_BUCKET, Key: s3Key }
    // const fileStream = s3.getObject(downloadParams).createReadStream()
    // const writeStream = fs.createWriteStream(tempVideoPath)
    // await new Promise((resolve, reject) => {
    //   fileStream.pipe(writeStream)
    //   writeStream.on('finish', resolve)
    //   writeStream.on('error', reject)
    // })

    // // Generate thumbnail from video
    // const thumbnailBuffer = await generateVideoThumbnail(tempVideoPath)

    // thumbnailUploadResult = await uploadImageToS3(
    //   `${name || 'video'}_thumbnail`,
    //   'image/png',
    //   thumbnailBuffer,
    //   'video_thumbnails'
    // )

    // if (!thumbnailUploadResult.success) {
    //   if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath)
    //   return res.status(500).json({ message: 'Failed to upload thumbnail' })
    // }

    // // Clean up
    // if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath)


    const longVideo = new LongVideo({
      name: name || 'Untitled Video',
      description: description || 'No description provided',
      videoUrl,
      thumbnailUrl: thumbnailUploadResult?.url,
      created_by: userId,
      updated_by: userId,
      community: communityId || null,
      series: seriesId || null,
      genre: genre || 'Action',
      type: type || 'Free',
      amount: amount ? parseFloat(amount) : 0,
      Videolanguage: language || 'English',
      age_restriction:
        age_restriction === 'true' || age_restriction === true || false,
      start_time: start_time ? Number(start_time) : 0,
      display_till_time: display_till_time ? Number(display_till_time) : 0,
      is_standalone: is_standalone === 'true',
      episode_number: episodeNumber || null,
      duration: 0,
      duration_formatted: '00:00:00',
    });

    let savedVideo = await longVideo.save();

    addVideoToProcessingQueue(
      savedVideo._id.toString(),
      s3Key,
      userId,
    );

    // If series specified, update it
    if (seriesId) {
      try {
        const series = await Series.findById(seriesId);
        if (series && series.created_by.toString() === userId.toString()) {
          const nextEpisodeNumber = (series.total_episodes || 0) + 1;
          await LongVideo.findByIdAndUpdate(savedVideo._id, {
            episode_number: nextEpisodeNumber,
            season_number: 1,
            is_standalone: false,
          });

          await Series.findByIdAndUpdate(seriesId, {
            $addToSet: { episodes: savedVideo._id },
            $inc: {
              total_episodes: 1,
              'analytics.total_likes': savedVideo.likes || 0,
              'analytics.total_views': savedVideo.views || 0,
              'analytics.total_shares': savedVideo.shares || 0,
            },
            $set: { 'analytics.last_analytics_update': new Date() },
          });
        }
      } catch (seriesError) {
        console.error('❌ Error adding video to series:', seriesError);
      }
    }

    // Stream processing tasks
    // await addVideoToStream(savedVideo._id.toString(), s3Key, userId, 'nsfw_detection');
    // await addVideoToStream(savedVideo._id.toString(), s3Key, userId, 'video_fingerprint');
    // await addVideoToStream(savedVideo._id.toString(), s3Key, userId, 'audio_fingerprint');

    // Update community
    if (communityId) {
      await Community.findByIdAndUpdate(communityId, {
        $push: { long_videos: savedVideo._id },
        $addToSet: { creators: userId },
      });
    }

    res.status(200).json({
      message: 'Video processed and saved successfully',
      videoId: savedVideo._id,
      videoUrl,
      thumbnailUrl: thumbnailUploadResult.url,
      videoName: name || 'Untitled Video',
      duration: 0,
      durationFormatted: '00:00:00',
      videoData: {
        name: savedVideo.name,
        description: savedVideo.description,
        genre: savedVideo.genre,
        type: savedVideo.type,
        amount: savedVideo.amount,
        language: savedVideo.Videolanguage,
        age_restriction: savedVideo.age_restriction,
        start_time: savedVideo.start_time,
        display_till_time: savedVideo.display_till_time,
        duration: 0,
        duration_formatted: '00:00:00',
      },
      nextSteps: {
        message: 'Use videoId to add this video to a community',
        endpoint: '/api/v1/videos/upload/community',
        requiredFields: ['communityId', 'videoId'],
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};


const uploadVideoToCommunity = async (req, res, next) => {
  try {
    const { communityId, videoId } = req.body;
    const userId = req.user.id;
    const video = await LongVideo.findById(videoId).select(
      'visibility hidden_reason community'
    );
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Long video not found' });
    }
    const hasPermission = await checkCommunityUploadPermission(
      userId,
      communityId
    );
    if (!hasPermission.hasPermission) {
      return res.status(403).json({
        error: hasPermission.error,
        requiredFee: hasPermission.requiredFee,
        communityName: hasPermission.communityName,
      });
    }
    if (video.community) {
      if (video.community.toString() === communityId) {
        return res
          .status(400)
          .json({ error: 'Video already uploaded in the Community' });
      } else {
        return res
          .status(404)
          .json({ error: 'Video is uploaded in another community' });
      }
    }
    const updatedCommunity = await Community.findByIdAndUpdate(
      communityId,
      {
        $addToSet: {
          [`long_videos`]: videoId,
        },
      },
      { new: true }
    );
    if (!updatedCommunity) {
      return res.status(404).json({ error: 'Community not found' });
    }
    await LongVideo.findByIdAndUpdate(
      videoId,
      { $set: { community: communityId } },
      { new: true }
    );
    res.status(200).json({
      message: 'Video added to community successfully',
      community: {
        id: updatedCommunity._id,
        name: updatedCommunity.name,
        long_videos: updatedCommunity.long_videos,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const uploadVideo = async (req, res, next) => {
  try {
    const videoFile = req.file;
    const userId = req.user.id.toString();
    const {
      name,
      description,
      genre,
      type,
      language,
      age_restriction,
      communityId,
      seriesId,
      start_time,
      display_till_time,
      is_standalone,
      episodeNumber,
      amount,
    } = req.body;

    console.log('📤 Video upload request received:');
    console.log('🎬 Series ID:', seriesId);
    console.log('📝 Video name:', name);
    console.log('🏠 Community ID:', communityId);
    console.log('🎭 Is standalone:', is_standalone);
    console.log('💰 Amount received:', amount, 'Type:', typeof amount);
    console.log('🎭 Type received:', type);

    if (!userId) {
      console.error(' User ID not found in request');
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!videoFile) {
      console.error(' No video file found in request');
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    if (!is_standalone) {
      console.error('is_standalone field not found');
      return res.status(400).json({ error: 'is_standalone field required' });
    }

    if (is_standalone === 'false' && (!episodeNumber || !seriesId)) {
      console.error(
        'episodeNumber and seriesId required for non-standalone videos'
      );
      return res.status(400).json({
        error: 'episodeNumber and seriesId required for non-standalone videos',
      });
    }
    if (type === 'Paid') {
      const numericAmount = parseFloat(amount);
      if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
        console.error(
          'Amount validation failed - amount:', amount, 'parsed:', numericAmount
        );
        return res.status(400).json({
          error:
            'Amount has to be included and should be greater than 0 for paid videos',
        });
      }
    }

    // Check upload permission using the proper function
    if (communityId) {
      const permissionCheck = await checkCommunityUploadPermission(
        userId,
        communityId
      );

      if (!permissionCheck.hasPermission) {
        return res.status(403).json({
          error: permissionCheck.error,
          requiredFee: permissionCheck.requiredFee,
          communityName: permissionCheck.communityName,
        });
      }

      // Check if user follows the community (only for non-founders)
      if (permissionCheck.accessType !== 'founder') {
        const community = await Community.findById(communityId);
        if (!community.followers.includes(userId)) {
          return res.status(403).json({
            error: 'You must follow the community to upload videos',
          });
        }
      }
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      console.error(' User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }
    const {
      compressedVideoBuffer,
      outputPath,
      fileOriginalName,
      fileMimeType,
      duration,
      durationFormatted,
    } = await videoCompressor(videoFile);

    const videoUploadResult = await uploadVideoToS3(
      compressedVideoBuffer,
      fileOriginalName,
      fileMimeType
    );
    if (!videoUploadResult.success) {
      console.error(' S3 upload failed:', videoUploadResult);
      return res.status(500).json({
        error: videoUploadResult.message,
        details: videoUploadResult.error || 'Failed to upload video to S3',
      });
    }

    const thumbnailBuffer = await generateVideoThumbnail(outputPath);

    const thumbnailUploadResult = await uploadImageToS3(
      `${fileOriginalName}_thumbnail`,
      'image/png',
      thumbnailBuffer,
      'video_thumbnails'
    );
    if (!thumbnailUploadResult.success) {
      console.log(thumbnailUploadResult.error);
      return res.status(500).json({ message: 'Failed to upload thumbnail' });
    }
    const longVideo = {
      name: name || videoFile.originalname,
      description: description || 'No description provided',
      videoUrl: videoUploadResult.url,
      created_by: userId,
      updated_by: userId,
      community: communityId,
      thumbnailUrl: thumbnailUploadResult.url,
      genre: genre || 'Action',
      type: type || 'Free',
      amount: amount ? parseFloat(amount) : 0,
      series: seriesId || null,
      episode_number: episodeNumber || null,
      age_restriction:
        age_restriction === 'true' || age_restriction === true || false,
      Videolanguage: language || 'English',
      start_time: start_time ? Number(start_time) : 0,
      display_till_time: display_till_time ? Number(display_till_time) : 0,
      subtitles: [],
      is_standalone: is_standalone === 'true',
      duration: duration || 0,
      duration_formatted: durationFormatted || '00:00:00', // Add this
    };
    let savedVideo = new LongVideo(longVideo);

    console.log('💾 Saving video with data:', longVideo);
    await savedVideo.save();

    if (seriesId) {
      try {

        // Get the series to check if it exists and get current episode count
        const series = await Series.findById(seriesId);
        if (series && series.created_by.toString() === userId.toString()) {
          // Calculate next episode number
          const nextEpisodeNumber = (series.total_episodes || 0) + 1;

          // Update the video with episode information
          await LongVideo.findByIdAndUpdate(savedVideo._id, {
            episode_number: nextEpisodeNumber,
            season_number: 1, // Default to season 1
            is_standalone: false
          });

          // Add video to series episodes and update analytics
          await Series.findByIdAndUpdate(seriesId, {
            $addToSet: { episodes: savedVideo._id },
            $inc: {
              total_episodes: 1,
              'analytics.total_likes': savedVideo.likes || 0,
              'analytics.total_views': savedVideo.views || 0,
              'analytics.total_shares': savedVideo.shares || 0,
            },
            $set: { 'analytics.last_analytics_update': new Date() },
          });

          console.log(`Video ${savedVideo._id} added to series ${seriesId} as episode ${nextEpisodeNumber}`);
        } else {
          console.error(` Series ${seriesId} not found or user ${userId} not authorized`);
        }
      } catch (seriesError) {
        console.error(' Error adding video to series:', seriesError);
      }
    }

    await addVideoToStream(
      savedVideo._id.toString(),
      videoUploadResult.key,
      userId,
      'nsfw_detection'
    );
    await addVideoToStream(
      savedVideo._id.toString(),
      videoUploadResult.key,
      userId,
      'video_fingerprint'
    );
    await addVideoToStream(
      savedVideo._id.toString(),
      videoUploadResult.key,
      userId,
      'audio_fingerprint'
    );
    // Update community with new video
    if (communityId) {
      await Community.findByIdAndUpdate(communityId, {
        $push: { long_videos: savedVideo._id },
        $addToSet: { creators: userId },
      });
    }

    // If video belongs to a series, add it to the series episodes
    if (seriesId) {
      try {
        const Series = require('../models/Series');

        // Get the series to check if it exists and get current episode count
        const series = await Series.findById(seriesId);
        if (series && series.created_by.toString() === userId.toString()) {
          // Calculate next episode number
          const nextEpisodeNumber = (series.total_episodes || 0) + 1;

          // Update the video with episode information
          await LongVideo.findByIdAndUpdate(savedVideo._id, {
            episode_number: nextEpisodeNumber,
            season_number: 1, // Default to season 1
            is_standalone: false
          });

          // Add video to series episodes and update analytics
          await Series.findByIdAndUpdate(seriesId, {
            $addToSet: { episodes: savedVideo._id },
            $inc: {
              total_episodes: 1,
              'analytics.total_likes': savedVideo.likes || 0,
              'analytics.total_views': savedVideo.views || 0,
              'analytics.total_shares': savedVideo.shares || 0,
            },
            $set: { 'analytics.last_analytics_update': new Date() },
          });

          console.log(`✅ Video ${savedVideo._id} added to series ${seriesId} as episode ${nextEpisodeNumber}`);
        } else {
          console.error(`❌ Series ${seriesId} not found or user ${userId} not authorized`);
        }
      } catch (seriesError) {
        console.error('❌ Error adding video to series:', seriesError);
        // Don't fail the entire upload, just log the error
      }
    }

    res.status(200).json({
      message: 'Video uploaded successfully',
      videoUrl: videoUploadResult.url,
      videoS3Key: videoUploadResult.key,
      thumbnailUrl: thumbnailUploadResult.url,
      thumbnailS3Key: thumbnailUploadResult.key,
      videoName: videoFile.originalname,
      fileSize: videoFile.size,
      duration: duration || 0,
      durationFormatted: durationFormatted || '00:00:00',
      videoId: savedVideo._id,
      videoData: {
        name: savedVideo.name,
        description: savedVideo.description,
        genre: savedVideo.genre,
        type: savedVideo.type,
        amount: savedVideo.amount,
        language: savedVideo.language,
        age_restriction: savedVideo.age_restriction,
        start_time: savedVideo.start_time,
        display_till_time: savedVideo.display_till_time,
        duration: savedVideo.duration || 0,
        duration_formatted: savedVideo.duration_formatted || '00:00:00',
      },
      nextSteps: {
        message: 'Use videoId to add this video to a community',
        endpoint: '/api/v1/videos/upload/community',
        requiredFields: ['communityId', 'videoId'],
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const uploadVideoChunks = (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const videoFile = req.file;

    const { fileId, chunkIndex, totalChunks } = req.body;
    if (!userId) {
      console.error(' User ID not found in request');
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!fileId || !chunkIndex || !totalChunks) {
      console.error(
        ' file ID, chunk index or total chunks not found in request'
      );
      return res
        .status(400)
        .json({ error: 'fileId, chunkIndex and totalChunks are required' });
    }
    const tempDir = path.join(os.tmpdir(), 'uploads', fileId);
    fs.mkdirSync(tempDir, { recursive: true });

    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, videoFile.buffer);
    res.status(200).json({
      message: 'Chunk uploaded successfully',
      fileId,
      chunkIndex,
      totalChunks,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};
const isMP4 = (originalname, mimetype) => {
  const isValidExtension = originalname?.toLowerCase().endsWith('.mp4');
  const isValidMime = mimetype === 'video/mp4';
  return isValidExtension && isValidMime;
};

const finaliseChunkUpload = async (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const {
      fileId,
      totalChunks,
      originalname,
      mimetype,
      name,
      description,
      genre,
      type,
      language,
      age_restriction,
      communityId,
      seriesId,
      start_time,
      display_till_time,
      is_standalone,
    } = req.body;
    if (!userId) {
      console.error(' User ID not found in request');
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!fileId || !totalChunks || !originalname || !mimetype) {
      console.error(
        ' file ID, total chunks, original name or mime type not found in request'
      );
      return res.status(400).json({
        error: 'fileId, totalChunks, originalname and mimetype are required',
      });
    }
    if (!isMP4(originalname, mimetype)) {
      return res.status(400).json({
        error: 'Only .mp4 videos are allowed.',
      });
    }
    //get the whole video file from chunks
    const tempDir = path.join(os.tmpdir(), 'uploads', fileId);
    const finalPath = path.join(tempDir, `full_${originalname}`);

    // Stitch chunks into one file
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}`);
      const data = fs.readFileSync(chunkPath);
      writeStream.write(data);
    }

    await new Promise((resolve) => writeStream.end(resolve)); // Wait for write to finish

    //Read final stitched video as Buffer
    const finalVideoBuffer = fs.readFileSync(finalPath);
    const videoFile = {
      buffer: finalVideoBuffer,
      mimetype,
      originalname,
      size: finalVideoBuffer.length,
    };

    if (!is_standalone) {
      console.error('is_standalone field not found');
      return res.status(400).json({ error: 'is_standalone field required' });
    }

    // Check upload permission using the proper function
    if (communityId) {
      const permissionCheck = await checkCommunityUploadPermission(
        userId,
        communityId
      );

      if (!permissionCheck.hasPermission) {
        return res.status(403).json({
          error: permissionCheck.error,
          requiredFee: permissionCheck.requiredFee,
          communityName: permissionCheck.communityName,
        });
      }

      // Check if user follows the community (only for non-founders)
      if (permissionCheck.accessType !== 'founder') {
        const community = await Community.findById(communityId);
        if (!community.followers.includes(userId)) {
          return res.status(403).json({
            error: 'You must follow the community to upload videos',
          });
        }
      }
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      console.error(' User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    //compress video file

    const {
      compressedVideoBuffer,
      outputPath,
      fileOriginalName,
      fileMimeType,
      duration,
      durationFormatted,
    } = await videoCompressor(videoFile);

    //delete the fileId folder inside the uploads folder in tmp
    fs.rmSync(tempDir, { recursive: true, force: true });

    //save video to S3
    const videoUploadResult = await uploadVideoToS3(
      compressedVideoBuffer,
      fileOriginalName,
      fileMimeType
    );
    if (!videoUploadResult.success) {
      console.error(' S3 upload failed:', videoUploadResult);
      return res.status(500).json({
        error: videoUploadResult.message,
        details: videoUploadResult.error || 'Failed to upload video to S3',
      });
    }

    const thumbnailBuffer = await generateVideoThumbnail(outputPath);

    const thumbnailUploadResult = await uploadImageToS3(
      `${fileOriginalName}_thumbnail`,
      'image/png',
      thumbnailBuffer,
      'video_thumbnails'
    );
    if (!thumbnailUploadResult.success) {
      console.log(thumbnailUploadResult.error);
      return res.status(500).json({ message: 'Failed to upload thumbnail' });
    }
    const longVideo = {
      name: name || videoFile.originalname,
      description: description || 'No description provided',
      videoUrl: videoUploadResult.url,
      created_by: userId,
      updated_by: userId,
      community: communityId,
      thumbnailUrl: thumbnailUploadResult.url,
      genre: genre || 'Action',
      type: type || 'Free',
      series: seriesId || null,
      age_restriction:
        age_restriction === 'true' || age_restriction === true || false,
      Videolanguage: language || 'English',
      start_time: start_time ? Number(start_time) : 0,
      display_till_time: display_till_time ? Number(display_till_time) : 0,
      subtitles: [],
      is_standalone: is_standalone === 'true',
      duration: duration || 0,
      duration_formatted: durationFormatted || '00:00:00',
    };
    let savedVideo = new LongVideo(longVideo);

    await savedVideo.save();

    // Update community with new video
    if (communityId) {
      await Community.findByIdAndUpdate(communityId, {
        $push: { long_videos: savedVideo._id },
        $addToSet: { creators: userId },
      });
    }

    // If video belongs to a series, add it to the series episodes
    if (seriesId) {
      try {
        const Series = require('../models/Series');

        // Get the series to check if it exists and get current episode count
        const series = await Series.findById(seriesId);
        if (series && series.created_by.toString() === userId.toString()) {
          // Calculate next episode number
          const nextEpisodeNumber = (series.total_episodes || 0) + 1;

          // Update the video with episode information
          await LongVideo.findByIdAndUpdate(savedVideo._id, {
            episode_number: nextEpisodeNumber,
            season_number: 1, // Default to season 1
            is_standalone: false
          });

          // Add video to series episodes and update analytics
          await Series.findByIdAndUpdate(seriesId, {
            $addToSet: { episodes: savedVideo._id },
            $inc: {
              total_episodes: 1,
              'analytics.total_likes': savedVideo.likes || 0,
              'analytics.total_views': savedVideo.views || 0,
              'analytics.total_shares': savedVideo.shares || 0,
            },
            $set: { 'analytics.last_analytics_update': new Date() },
          });

          console.log(`✅ Video ${savedVideo._id} added to series ${seriesId} as episode ${nextEpisodeNumber}`);
        } else {
          console.error(`❌ Series ${seriesId} not found or user ${userId} not authorized`);
        }
      } catch (seriesError) {
        console.error('❌ Error adding video to series:', seriesError);
        // Don't fail the entire upload, just log the error
      }
    }

    res.status(200).json({
      message: 'Video uploaded successfully',
      videoUrl: videoUploadResult.url,
      videoS3Key: videoUploadResult.key,
      thumbnailUrl: thumbnailUploadResult.url,
      thumbnailS3Key: thumbnailUploadResult.key,
      videoName: videoFile.originalname,
      fileSize: videoFile.size,
      duration: duration,
      videoId: savedVideo._id,
      videoData: {
        name: savedVideo.name,
        description: savedVideo.description,
        genre: savedVideo.genre,
        type: savedVideo.type,
        amount: savedVideo.amount,
        language: savedVideo.language,
        age_restriction: savedVideo.age_restriction,
        start_time: savedVideo.start_time,
        display_till_time: savedVideo.display_till_time,
        duration: savedVideo.duration,
        duration_formatted: savedVideo.duration_formatted,
      },
      nextSteps: {
        message: 'Use videoId to add this video to a community',
        endpoint: '/api/v1/videos/upload/community',
        requiredFields: ['communityId', 'videoId'],
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const createVideoABSSegments = async (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const { videoId } = req.body;

    if (!userId || !videoId) {
      console.error(' User ID or Video ID not found in request');
      return res.status(400).json({ error: 'User ID, Video ID is required' });
    }

    const video = await LongVideo.findById(videoId);
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' });
    }
    const videoUrl = video.videoUrl;
    const videoFile = await getFileFromS3Url(videoUrl);

    const videoSegmentUrls = await generateVideoABSSegments(videoFile, videoId);

    // Format the videoResolutions properly with master playlist
    const formattedResolutions = {
      master: {
        url: videoSegmentUrls.master?.url || videoUrl,
        type: 'hls' // Indicate this is an HLS master playlist
      },
      variants: {}
    };

    // Convert the segments object to the proper format (excluding master)
    Object.entries(videoSegmentUrls).forEach(([resolution, data]) => {
      if (resolution !== 'master') {
        formattedResolutions.variants[resolution] = data.url;
      }
    });

    await LongVideo.findOneAndUpdate(
      { _id: videoId },
      { $set: { videoResolutions: formattedResolutions } },
      { new: true }
    );

    res.status(200).json({
      message: 'Segments created successfully',
      segments: formattedResolutions,
      masterPlaylistUrl: formattedResolutions.master.url
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getVideoABSSegments = async (req, res, next) => {
  const userId = req.user.id.toString();
  const { videoId } = req.query;
  try {
    if (!userId || !videoId) {
      console.error(' User ID or Video ID not found in request');
      return res.status(400).json({ error: 'User ID, Video ID is required' });
    }

    const video = await LongVideo.findById(videoId).select('videoResolutions');
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.status(200).json({
      message: 'Segments retrieved successfully',
      segments: video.videoResolutions,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const searchVideos = async (req, res, next) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchRegex = new RegExp(query, 'i');

    const longVideos = await LongVideo.find({
      $and: [
        {
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { genre: searchRegex },
          ],
        },
      ],
    })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('comments', '_id content user createdAt')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const totalLong = await LongVideo.countDocuments({
      $and: [
        {
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { genre: searchRegex },
          ],
        },
      ],
    });

    res.status(200).json({
      message: 'Search results retrieved successfully',
      data: {
        longVideos,

        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalLong / limit),
          totalResults: totalLong,
          longVideoCount: totalLong,
        },
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getVideoById = async (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const { id } = req.params;
    let video = await LongVideo.findById(id)
      .lean()
      .populate('created_by', 'username profile_photo')
      .populate('community', 'name profile_photo followers')
      .populate({
        path: 'series',
        select: 'title description price genre episodes type seasons total_episodes',
        populate: {
          path: 'created_by',
          select: 'username profile_photo',
        },
        populate: [
          {
            path: 'episodes',
            select:
              'name episode_number season_number type thumbnailUrl views likes',
            options: { sort: { season_number: 1, episode_number: 1 } },
          },
          {
            path: 'created_by',
            select: 'username profile_photo',
          },
        ],
      })
      .populate('liked_by', 'username profile_photo');

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' });
    }

    await addDetailsToVideoObject(video, userId);

    res.status(200).json({
      message: 'Video retrieved successfully',
      video,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const updateVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      name,
      description,
      genre,
      language,
      age_restriction,
      start_time,
      display_till_time,
    } = req.body;

    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      updated_by: userId,
    };

    if (genre) updateData.genre = genre;
    if (language) updateData.language = language;
    if (age_restriction !== undefined)
      updateData.age_restriction = age_restriction;
    if (start_time !== undefined) updateData.start_time = Number(start_time);
    if (display_till_time !== undefined)
      updateData.display_till_time = Number(display_till_time);

    let video = await LongVideo.findById(id);
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Long video not found' });
    }

    if (video.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to update this video' });
    }

    video = await LongVideo.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    res.status(200).json({
      message: 'Video updated successfully',
      data: video,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const deleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id.toString();
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    let video = await LongVideo.findById(id);
    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Long video not found' });
    }
    //only video creator is allowed to delete the video
    if (video.created_by.toString() !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this video' });
    }
    //unpublish video
    await LongVideo.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          visibility: 'hidden',
          hidden_reason: 'video_deleted',
          hidden_at: new Date(),
        },
      },
      { new: true }
    );

    res.status(200).json({
      message: 'Video deleted successfully',
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getTrendingVideos = async (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId).select('following');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const videos = await LongVideo.find({})
      .lean()
      .populate('created_by', 'username email profile_photo custom_name')
      .populate('community', 'name profile_photo followers')
      .populate({
        path: 'series',
        populate: [
          {
            path: 'episodes',
            select:
              'name episode_number season_number thumbnailUrl views likes',
            options: { sort: { season_number: 1, episode_number: 1 } },
          },
          {
            path: 'created_by',
            select: 'username profile_photo',
          },
        ],
      })
      .sort({ views: -1, likes: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    for (let i = 0; i < videos.length; i++) {
      await addDetailsToVideoObject(videos[i], userId);
      const creatorPassDetails = await User.findById(
        videos[i].created_by._id?.toString()
      )
        .lean()
        .select(
          'creator_profile.creator_pass_price creator_profile.total_earned creator_profile.bank_verified creator_profile.verification_status creator_profile.creator_pass_deletion.deletion_requested creator_profile.bank_details.account_type'
        );

      if (creatorPassDetails && Object.keys(creatorPassDetails).length > 0) {
        videos[i].creatorPassDetails = creatorPassDetails;
      }
    }
    let total = await LongVideo.countDocuments();

    res.status(200).json({
      message: 'Trending videos retrieved successfully',
      data: videos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),

        totalResults: total,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getVideosByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const videos = await LongVideo.find({
      genre,
    })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('series', 'title')
      .populate('comments', '_id content user createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await LongVideo.countDocuments({
      genre,
    });

    res.status(200).json({
      message: `Videos in ${genre} genre retrieved successfully`,
      data: videos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalResults: total,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const incrementVideoView = async (req, res, next) => {
  try {
    const { id } = req.params;

    let video = await LongVideo.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.status(200).json({
      message: 'View count updated successfully',
      data: { views: video.views },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getRelatedVideos = async (req, res, next) => {
  try {
    const { id } = req.params;

    let video = await LongVideo.findById(id);

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const relatedVideos = await LongVideo.find({
      _id: { $ne: id },
      genre: video.genre,
    })
      .populate('created_by', 'username email')
      .populate('community', 'name')
      .populate('comments', '_id content user createdAt')
      .limit(10);

    res.status(200).json({
      message: 'Related videos retrieved successfully',
      data: relatedVideos,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getVideoGiftingInfo = async (req, res, next) => {
  try {
    const { id } = req.params;

    let video = await LongVideo.findById(id)
      .select('visibility hidden_reason')
      .lean();

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const giftingInfo = await WalletTransaction.find({
      content_id: id,
      transaction_category: 'video_gift',
    })
      .lean()
      .select(
        'user_id amount currency description balance_before balance_after'
      )
      .populate('user_id', 'username profile_photo');
    res.status(200).json({
      message: 'Gifting Info retrieved successfully',
      data: giftingInfo,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getVideoTotalGifting = async (req, res, next) => {
  try {
    const { id } = req.params;

    let video = await LongVideo.findById(id)
      .select('visibility hidden_reason gifts')
      .lean();

    if (
      !video ||
      (video.visibility === 'hidden' && video.hidden_reason === 'video_deleted')
    ) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.status(200).json({
      message: 'Gifting Info retrieved successfully',
      data: video.gifts,
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};

const getAllVideos = async (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const viewedVideoIds = (user.viewed_videos || []).map(id => {
      return mongoose.Types.ObjectId.isValid(id) ? 
        (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)) : 
        null;
    }).filter(Boolean);
    
    console.log('Viewed Video IDs:', viewedVideoIds);
    const followingIds = (user.following || []).map((id) => id.toString());

    const videos = [];

    const interestedVideos = await LongVideo.find({
      _id: { $nin: viewedVideoIds },
    })
      .lean()
      .populate('created_by', 'username profile_photo custom_name')
      .populate('community', 'name profile_photo followers')
      .populate({
        path: 'series',
        populate: [
          {
            path: 'episodes',
            match: { _id: { $nin: viewedVideoIds } }, 
            select: 'name episode_number season_number thumbnailUrl views likes',
            options: { sort: { season_number: 1, episode_number: 1 } },
          },
          {
            path: 'created_by',
            select: 'username profile_photo',
          },
        ],
      })
      .sort({ views: -1, likes: -1 });

    // Process each video with access check
    for (let i = 0; i < interestedVideos.length; i++) {
      let video = interestedVideos[i]; // Convert to plain object

      // Add following status
      if (
        video.created_by &&
        followingIds.includes(video.created_by._id.toString())
      ) {
        video.is_following_creator = true;
      } else {
        video.is_following_creator = false;
      }

      if (video.community) {
        const isFollowing = video.community.followers.some(
          (followerId) => followerId.toString() === userId
        );
        video.is_following_community = isFollowing;
      }

      const { checkCreatorPass } = require('./user.controller');
      // Check access and add access field
      video = await checkAccess(video, userId);
      video.hasCreatorPassOfVideoOwner = await checkCreatorPass(userId, video.created_by._id.toString());
      
      const creatorPassDetails = await User.findById(
        video.created_by._id?.toString()
      )
        .lean()
        .select(
          'creator_profile.creator_pass_price creator_profile.total_earned creator_profile.bank_verified creator_profile.verification_status creator_profile.creator_pass_deletion.deletion_requested creator_profile.bank_details.account_type'
        );

      if (creatorPassDetails && Object.keys(creatorPassDetails).length > 0) {
        video.creatorPassDetails = creatorPassDetails;
      }
      
      // check if user has liked the video
      if (video.liked_by && video.liked_by.length > 0) {
        video.is_liked_video = video.liked_by.some(
          (like) => like.user && like.user._id?.toString() === userId
        );
      }
      
      interestedVideos[i] = video;
    }
    
    videos.push(...interestedVideos);
    
    res.status(200).json({
      message: 'Videos retrieved successfully',
      data: videos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(videos.length / limit),
        totalResults: videos.length,
      },
    });
  } catch (error) {
    handleError(error, req, res, next);
  }
};
module.exports = {
  uploadVideo,
  searchVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  getTrendingVideos,
  getVideosByGenre,
  incrementVideoView,
  getRelatedVideos,
  uploadVideoToCommunity,
  createVideoABSSegments,
  getVideoABSSegments,
  uploadVideoChunks,
  finaliseChunkUpload,
  getVideoGiftingInfo,
  getVideoTotalGifting,
  getUploadUrl,
  processUploadedVideo,
  getAllVideos
};
