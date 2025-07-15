const { spawn } = require('child_process');
const streamifier = require('streamifier');
const { PassThrough } = require('stream');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const videoCompressor=(fileBuffer)=>{
 const inputPath = path.join(__dirname, `temp-${uuidv4()}.mp4`);
 const outputPath = path.join(__dirname, `compressed-${uuidv4()}.mp4`);
 fs.writeFileSync(inputPath, fileBuffer);
  return new Promise((resolve,reject)=>{
    const ffmpegProcess = spawn('ffmpeg', [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', 'frag_keyframe+empty_moov',
      outputPath
    ]);

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    ffmpegProcess.on('error', (err) => {
      const errorMsg=`FFmpeg error:${err.message}`
      console.error('FFmpeg error:', err);
      fs.unlinkSync(inputPath);
      reject(new Error(errorMsg));
    });

    ffmpegProcess.on('exit', (code) => {
      if (code !== 0) {
        const errorMsg= `FFmpeg-Error:exited with code ${code}`
        console.error(errorMsg);
        fs.unlinkSync(inputPath);
        return reject(new Error(errorMsg));
      }
       try {
        const compressedBuffer = fs.readFileSync(outputPath);
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        resolve(compressedBuffer);
      } catch (err) {
        fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        const errorMsg= `FFmpeg-Error:${err.message}`
        reject(new Error(errorMsg));
      }
    });
  })
 
}


module.exports=videoCompressor


 