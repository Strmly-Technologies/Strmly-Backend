const { spawn } = require('child_process')
const path = require('path')
const { getFileFromS3Url } = require('./utils')
const LongVideo = require('../models/LongVideo')
const { S3RetrievalError } = require('./errors')
const { cleanup, createDirs, saveFileBuffer } = require('./fingerprint_video')

const extractAudio = (videoPath, outputDir, inputFileName) => {
  const outputPath = path.join(outputDir, `${inputFileName}.wav`)
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '44100',
      '-ac',
      '2',
      outputPath,
      '-y',
    ])

    ffmpeg.stderr.on('data', (data) => process.stderr.write(data))
    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg error: ${err.message}`))
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(outputPath)
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

const generateAudioFingerprint = (audioPath) => {
  return new Promise((resolve, reject) => {
    const fp = spawn('fpcalc', [audioPath])
    let output = ''

    fp.stdout.on('data', (data) => {
      output += data.toString()
    })
    fp.stderr.on('data', (data) => process.stderr.write(data))
    fp.on('error', (err) => {
      reject(new Error(`fpcalc error: ${err.message}`))
    })
    fp.on('close', (code) => {
      if (code !== 0)
        return reject(new Error(`fpcalc exited with code ${code}`))
      resolve(output.split('FINGERPRINT=')[1].split('\r\n')[0])
    })
  })
}

const fingerprintAudio = async (videoId, videoUrl) => {
  const outputDir = path.join(__dirname, 'audio_output')
  const tempDir = path.join(__dirname, 'audio_uploads')
  try {
    createDirs(tempDir, outputDir)
    const videoFile = await getFileFromS3Url(videoUrl)
    if (!videoFile) {
      throw new S3RetrievalError('couldnt retrieve video file')
    }
    const { inputFilePath, inputFileName } = saveFileBuffer(
      videoFile.buffer,
      videoFile.mimetype,
      videoId,
      tempDir
    )

    const outputPath = await extractAudio(
      inputFilePath,
      outputDir,
      inputFileName
    )
    const output = await generateAudioFingerprint(outputPath)
    const audio_fingerprint = output.fingerprint
    await LongVideo.findOneAndUpdate(
      { _id: videoId, audio_fingerprint: '' },
      { $set: { audio_fingerprint } },
      { new: true }
    )

    cleanup(tempDir, outputDir)
  } catch (e) {
    cleanup(tempDir, outputDir)
    throw e
  }
}

module.exports = { fingerprintAudio }
