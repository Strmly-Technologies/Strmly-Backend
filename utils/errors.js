class FileSaveError extends Error {
  constructor(message) {
    super(message)
    this.name = 'file_save_error'
  }
}

class FFProbeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ffprobe_operation_error'
  }
}

class FFmpegError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ffmpeg_operation_error'
  }
}

class UnknownResolutionError extends Error {
  constructor(message = 'input video is of invalid resolution') {
    super(message)
    this.name = 'unknown_video_resolution_error'
  }
}

class S3UploadError extends Error {
  constructor(message) {
    super(message)
    this.name = 'S3_upload_error'
  }
}
module.exports = {
  FileSaveError,
  FFProbeError,
  FFmpegError,
  UnknownResolutionError,
  S3UploadError,
}
