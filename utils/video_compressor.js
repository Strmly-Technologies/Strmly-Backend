const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const videoCompressor = (file) => {
  const fileOriginalName = file.originalname
  const fileMimeType = file.mimetype
  const fileBuffer = file.buffer
  const inputPath = path.join(__dirname, `temp-${uuidv4()}.mp4`)
  const outputPath = path.join(__dirname, `compressed-${uuidv4()}.mp4`)
  fs.writeFileSync(inputPath, fileBuffer)
  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn('ffmpeg', [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      'frag_keyframe+empty_moov',
      outputPath,
    ])

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(data.toString())
    })

    ffmpegProcess.on('error', (error) => {
      const errorMsg = `FFmpeg-Error:${error.message}`
      console.error('FFmpeg error:', error)
      fs.unlinkSync(inputPath)
      const err = new Error(errorMsg)
      err.name = 'FFmpegError'
      reject(err)
    })

    ffmpegProcess.on('exit', (code) => {
      if (code !== 0) {
        const errorMsg = `FFmpeg-Error:exited with code ${code}`
        console.error(errorMsg)
        fs.unlinkSync(inputPath)
        const err = new Error(errorMsg)
        err.name = 'FFmpegError'
        return reject(err)
      }
      try {
        const compressedVideoBuffer = fs.readFileSync(outputPath)
        fs.unlinkSync(inputPath)
        //fs.unlinkSync(outputPath)
        resolve({
          compressedVideoBuffer,
          outputPath,
          fileOriginalName,
          fileMimeType,
        })
      } catch (error) {
        fs.unlinkSync(inputPath)
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        const errorMsg = `FFmpeg-Error:${error.message}`
        const err = new Error(errorMsg)
        err.name = 'FFmpegError'
        reject(err)
      }
    })
  })
}

module.exports = videoCompressor
