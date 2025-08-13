/* eslint-disable no-useless-catch */
const { imageHash } = require('image-hash')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { getFileFromS3Url } = require('./utils')
const LongVideo = require('../models/LongVideo')
const { S3RetrievalError, FileSaveError } = require('./errors')

const saveFileBuffer = (fileBuffer, fileMimeType, videoId, tempDir) => {
  try {
    const inputFileName = `temp-${videoId}.${fileMimeType.split('/')[1]}`
    const inputFilePath = path.join(path.resolve(tempDir), inputFileName)
    fs.writeFileSync(inputFilePath, fileBuffer)
    return { inputFilePath, inputFileName }
  } catch (e) {
    throw new FileSaveError(e.message)
  }
}

const generatePHash = async (filePaths) => {
  const pHashes = filePaths.map(
    (file) =>
      new Promise((res, rej) => {
        imageHash(file, 16, false, (error, data) => {
          if (error) rej(error)
          console.log(data)
          res(data)
        })
      })
  )
  return await Promise.all(pHashes)
}

const hexToBinary = (hex) =>
  hex
    .split('')
    .map((h) => parseInt(h, 16).toString(2).padStart(4, '0'))
    .join('')

const binaryToHex = (bin) =>
  bin
    .match(/.{1,4}/g)
    .map((b) => parseInt(b, 2).toString(16))
    .join('')

const bitwiseAvgHashes = (pHashes) => {
  const binaryHashes = []
  pHashes.forEach((pHash) => {
    binaryHashes.push(hexToBinary(pHash))
  })

  const bitLength = binaryHashes[0].length
  const bitSums = new Array(bitLength).fill(0)

  for (const bin of binaryHashes) {
    for (let i = 0; i < bitLength; i++) {
      bitSums[i] += bin[i] === '1' ? 1 : 0
    }
  }

  const threshold = pHashes.length / 2
  const finalBinary = bitSums
    .map((sum) => (sum > threshold ? '1' : '0'))
    .join('')
  return binaryToHex(finalBinary)
}

const getFrames = async (filePath, outputDir, fileName) => {
  return new Promise((res, rej) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    const ffmpeg = spawn('ffmpeg', [
      '-i',
      filePath,
      '-vf',
      '-vf fps=1 -frames:v 100',
      path.join(outputDir, `${fileName}_%04d.jpg`),
    ])

    ffmpeg.stderr.on('data', (data) => {
      console.log(data.toString())
    })
    ffmpeg.on('error', (err) => {
      rej(new Error(`FFmpeg error: ${err.message}`))
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.endsWith('.jpg'))
          .map((f) => path.join(outputDir, f))
        res(files)
      } else {
        rej(new Error(`FFmpeg exited with code ${code}`))
      }
    })
  })
}

const cleanup = (tempDir, outputDir) => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true })
  }
}

const createDirs = (tempDir, outputDir) => {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
}

const fingerprintVideo = async (videoId, videoUrl) => {
  const outputDir = path.join(__dirname, 'out')
  const tempDir = path.join(__dirname, 'uploads')
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

    const files = await getFrames(inputFilePath, outputDir, inputFileName)
    const pHashes = await generatePHash(files)
    const fingerprint = bitwiseAvgHashes(pHashes)
    await LongVideo.findOneAndUpdate(
      { _id: videoId, fingerprint: '' },
      { $set: { fingerprint } },
      { new: true }
    )

    cleanup(tempDir, outputDir)
  } catch (e) {
    cleanup(tempDir, outputDir)
    throw e
  }
}

const compareHammingDistance = (str1, str2, threshold = 5) => {
  const bin1 = hexToBinary(str1)
  const bin2 = hexToBinary(str2)
  if (bin1.length !== bin2.length) return false

  let dif = 0
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) dif++
    if (dif >= threshold) return false // early exit
  }
  return true
}

const findVideoDuplicates = async (videoId) => {
  try {
    const newVideo = await LongVideo.findById(videoId).select('fingerprint')
    if (newVideo.fingerprint === '') {
      throw new Error('fingerprint not found')
    }
    const videos = await LongVideo.find({
      _id: { $ne: videoId },
    }).select('fingerprint _id videoUrl')

    const duplicates = []

    videos.forEach((video) => {
      if (video.fingerprint !== '') {
        const ismatch = compareHammingDistance(
          newVideo.fingerprint,
          video.fingerprint
        )
        if (ismatch) {
          duplicates.push(video._id)
        }
      }
    })
    return duplicates
  } catch (e) {
    throw e
  }
}
module.exports = {
  fingerprintVideo,
  findVideoDuplicates,
  cleanup,
  createDirs,
  saveFileBuffer,
}
