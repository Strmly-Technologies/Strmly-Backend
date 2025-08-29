const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { v4: uuidv4 } = require('uuid')

const runFFprobe = (filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])

    let output = ''
    ffprobe.stdout.on('data', (data) => {
      output += data.toString()
    })

    ffprobe.stderr.on('data', (data) => {
      console.error(`ffprobe stderr: ${data}`)
    })

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}`))
      }
      resolve(parseFloat(output.trim()))
    })
  })
}

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '00:00:00'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  return [hours, minutes, secs]
    .map((val) => val.toString().padStart(2, '0'))
    .join(':')
}

const videoCompressor = (file) => {
  const fileOriginalName = file.originalname
  const fileMimeType = file.mimetype
  const fileBuffer = file.buffer
  const tempDir = os.tmpdir()
  const inputPath = path.join(tempDir, `temp-${uuidv4()}.mp4`)
  const outputPath = path.join(tempDir, `compressed-${uuidv4()}.mp4`)

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
      fs.unlinkSync(inputPath)
      reject(new Error(`FFmpegError:${error.message}`))
    })

    ffmpegProcess.on('exit', async (code) => {
      if (code !== 0) {
        fs.unlinkSync(inputPath)
        reject(new Error(`FFmpegError: exited with code ${code}`))
        return
      }

      try {
        const compressedVideoBuffer = fs.readFileSync(outputPath)
        const duration = await runFFprobe(outputPath)
        const durationFormatted = formatDuration(duration)

        console.log(
          `Video duration: ${duration} seconds (${durationFormatted})`
        )

        fs.unlinkSync(inputPath)

        resolve({
          compressedVideoBuffer,
          outputPath,
          fileOriginalName,
          fileMimeType,
          duration,
          durationFormatted,
        })
      } catch (error) {
        fs.unlinkSync(inputPath)
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        reject(new Error(`FFmpegError:${error.message}`))
      }
    })
  })
}

module.exports = videoCompressor
