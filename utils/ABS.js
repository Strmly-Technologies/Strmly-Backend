/* eslint-disable no-useless-catch */
//Adaptive Bitrate Streaming for videos
const fs = require('fs')
const path = require('path')
const { exec, spawn } = require('child_process')
const {
  FileSaveError,
  FFProbeError,
  FFmpegError,
  UnknownResolutionError,
  S3UploadError,
} = require('./errors')
const { s3 } = require('../config/AWS')
const saveFileBuffer = (fileBuffer, fileMimeType, videoId) => {
  try {
    const inputFileName = `temp-${videoId}.${fileMimeType.split('/')[1]}`
    const tmpDir = `${__dirname}/tmp`
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    const inputFilePath = path.join(path.resolve(tmpDir), inputFileName)
    fs.writeFileSync(inputFilePath, fileBuffer)
    return { tmpDir, inputFilePath }
  } catch (e) {
    throw new FileSaveError(e.message)
  }
}

const getVideoResolution = (filePath) => {
  return new Promise((res, rej) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${filePath}"`,
      (err, stdout, stderr) => {
        if (err) {
          return rej(new FFProbeError(err.message))
        }
        const output = JSON.parse(stdout)
        const stream = output.streams?.[0]
        console.log(output)
        if (!stream || !stream.width || !stream.height) {
          return rej(new FFProbeError('Could not determine resolution'))
        }

        res({ width: stream.width, height: stream.height })
      }
    )
  })
}

const analyzeVideoResolutionRange = async (inputFilePath) => {
  try {
    const videoResolution = await getVideoResolution(inputFilePath)
    let resolutionRange = 'unknown'
    let p1 = videoResolution.width
    let p2 = videoResolution.height
    let videoType = 'landscape'
    if (videoResolution.height > videoResolution.width) {
      videoType = 'potrait'
      p1 = videoResolution.height
      p2 = videoResolution.width
    }
    if (parseInt(p2) >= 1080 && parseInt(p1) >= 1920) resolutionRange = '1080p'
    else if (parseInt(p2) >= 720 && parseInt(p1) >= 1280)
      resolutionRange = '720p'
    else if (parseInt(p2) >= 480 && parseInt(p1) >= 854)
      resolutionRange = '480p'
    else if (parseInt(p2) >= 360 && parseInt(p1) >= 640)
      resolutionRange = '360p'
    else if (parseInt(p2) >= 240 && parseInt(p1) >= 426)
      resolutionRange = '240p'
    console.log(
      `Detected quality: ${resolutionRange} height: ${videoResolution.height} width:${videoResolution.width} video type: ${videoType}`
    )
    if (resolutionRange === 'unknown') {
      throw new UnknownResolutionError()
    }
    return { resolutionRange, videoType }
  } catch (e) {
    throw e
  }
}

const resolutionLadder = [
  { label: '1080p', p2: 1080, p1: 1920 },
  { label: '720p', p2: 720, p1: 1280 },
  { label: '480p', p2: 480, p1: 854 },
  { label: '360p', p2: 360, p1: 640 },
  { label: '240p', p2: 240, p1: 426 },
]

const generateVideo = async (height, width, inputPath, reqLabel) => {
  return new Promise((resolve, reject) => {
    const parts = inputPath.split('.')
    const outputPath = `${parts[0]}-op-${reqLabel}.${parts[1]}`
    const ffmpeg = spawn('ffmpeg', [
      '-i',
      inputPath,
      '-vf',
      `scale=${width}:${height}`,
      '-c:a',
      'copy',
      outputPath,
      '-y', // overwrite
    ])

    ffmpeg.stderr.on('data', (data) => {
      console.log(`[ffmpeg]: ${data}`)
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0)
        return reject(new FFmpegError(`FFmpeg exited with ${code}`))
      resolve(outputPath)
    })
  })
}

const generateLowerResVideos = async (vr, inputFilePath) => {
  const videos = [{ res: vr.resolutionRange, path: inputFilePath }]

  let i
  for (i = 0; i < resolutionLadder.length; i++) {
    if (resolutionLadder[i].label === vr.resolutionRange) {
      break
    }
  }
  i++
  let itr = 1
  for (i; i < resolutionLadder.length; i++) {
    //encode
    let height =
      vr.videoType === 'potrait'
        ? resolutionLadder[i].p1
        : resolutionLadder[i].p2
    let width =
      vr.videoType === 'potrait'
        ? resolutionLadder[i].p2
        : resolutionLadder[i].p1

    const outputFilePath = await generateVideo(
      height,
      width,
      inputFilePath,
      resolutionLadder[i].label
    )
    videos.push({ res: resolutionLadder[i].label, path: outputFilePath })
    itr++
    if (itr > 2) {
      break
    }
  }
  return videos
}

const segmentGenerator = (inputPath, outputDir) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

    const args = [
      '-i',
      inputPath,
      '-codec:',
      'copy',
      '-start_number',
      '0',
      '-hls_time',
      '10',
      '-hls_list_size',
      '0',
      '-f',
      'hls',
      path.join(outputDir, 'index.m3u8'),
    ]

    const ffmpeg = spawn('ffmpeg', args)

    ffmpeg.stderr.on('data', (data) => {
      console.log('[ffmpeg]', data.toString())
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0)
        return reject(new FFmpegError(`FFmpeg exited with ${code}`))
      resolve()
    })
  })
}

const segmentVideo = async (videos, videoId) => {
  try {
    for (const video of videos) {
      const segmentPath = `${videoId}-segments-${video.res}`
      await segmentGenerator(video.path, segmentPath)
      video.segmentPath = segmentPath
    }
  } catch (e) {
    throw e
  }
}

const walkDir = (dir) => {
  let files = []
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file)
    if (fs.lstatSync(fullPath).isDirectory()) {
      files = files.concat(walkDir(fullPath))
    } else {
      files.push(fullPath)
    }
  })
  return files
}

const uploadVideoSegmentsToS3 = async (segmentPath) => {
  try {
    let metadataUrl = ''
    let metadataKey = ''

    const files = walkDir(segmentPath)
    for (const filePath of files) {
      const fileMimeType = filePath.split('.')[1]
      const fileContent = fs.readFileSync(filePath)
      const relativePath = path.relative(segmentPath, filePath)
      const segmentFolderName = path.basename(segmentPath)
      const s3Key = path.posix
        .join('ABSSegments', segmentFolderName, relativePath)
        .replace(/\\/g, '/') // Windows fix

      const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: fileContent,
        ContentType: fileMimeType,
        Metadata: {
          originalName: filePath,
          uploadDate: new Date().toISOString(),
        },
      }
      const result = await s3.upload(uploadParams).promise()
      if (fileMimeType === 'm3u8') {
        metadataUrl = result.Location
        metadataKey = result.key
      }
    }
    return {
      success: true,
      url: metadataUrl,
      key: metadataKey,
    }
  } catch (e) {
    throw new S3UploadError(e.message)
  }
}

const generateMasterPlaylist = (variants, videoId) => {
  let masterPlaylistContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n'

  // Define resolution configurations
  const resolutionConfigs = {
    '240p': { bandwidth: 400000, resolution: '426x240' },
    '360p': { bandwidth: 800000, resolution: '640x360' },
    '480p': { bandwidth: 1200000, resolution: '854x480' },
    '720p': { bandwidth: 2500000, resolution: '1280x720' },
    '1080p': { bandwidth: 5000000, resolution: '1920x1080' },
  }

  // Add each variant to the master playlist
  Object.entries(variants).forEach(([resolution, url]) => {
    const config = resolutionConfigs[resolution]
    if (config) {
      masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${config.bandwidth},RESOLUTION=${config.resolution}\n`
      masterPlaylistContent += `${url}\n\n`
    }
  })

  return masterPlaylistContent
}

const uploadMasterPlaylistToS3 = async (playlistContent, videoId) => {
  try {
    const fileName = `video-segments/${videoId}/master.m3u8`

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: playlistContent,
      ContentType: 'application/vnd.apple.mpegurl',
    }

    const result = await s3.upload(uploadParams).promise()

    return {
      success: true,
      url: result.Location,
      key: result.Key,
    }
  } catch (error) {
    console.error('Error uploading master playlist to S3:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

const generateVideoABSSegments = async (videoFile, videoId) => {
  try {
    //get the input path of the original video
    const { tmpDir, inputFilePath } = saveFileBuffer(
      videoFile.buffer,
      videoFile.mimetype,
      videoId
    )
    //determine the resolution range of the original video
    const vr = await analyzeVideoResolutionRange(inputFilePath)
    //create videos of lower resolution
    const videos = await generateLowerResVideos(vr, inputFilePath)
    //create the segments
    await segmentVideo(videos, videoId)
    //store the segments in S3
    let segmentM3u8Urls = {}
    let videoSegmentUrls = {}
    for (const video of videos) {
      const uploadResult = await uploadVideoSegmentsToS3(video.segmentPath)
      if (fs.existsSync(video.segmentPath)) {
        fs.rmSync(video.segmentPath, { recursive: true, force: true })
      }
      segmentM3u8Urls[video.res] = {
        url: uploadResult.url,
        key: uploadResult.key,
      }
      videoSegmentUrls[video.res] = uploadResult.url
    }
    //cleanup
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
    //return segments metadata (.m3u8) url

    // After generating all resolution segments, create master playlist
    const masterPlaylistContent = generateMasterPlaylist(videoSegmentUrls, videoId)

    // Upload master playlist to S3
    const masterUploadResult = await uploadMasterPlaylistToS3(masterPlaylistContent, videoId)

    if (masterUploadResult.success) {
      // Add master URL to the response
      segmentM3u8Urls.master = {
        url: masterUploadResult.url,
        key: masterUploadResult.key,
      }
    }

    return segmentM3u8Urls
  } catch (e) {
    throw e
  }
}

module.exports = { generateVideoABSSegments, saveFileBuffer }
