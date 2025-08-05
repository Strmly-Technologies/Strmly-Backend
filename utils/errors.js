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

class S3RetrievalError extends Error {
  constructor(message) {
    super(message)
    this.name = 'S3_retrieval_error'
  }
}
class RedisConnectionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'redis_connection_error'
  }
}

class NotificationQueueError extends Error {
  constructor(message) {
    super(message)
    this.name = 'notification_queue_error'
  }
}

class VideoQueueError extends Error {
  constructor(message) {
    super(message)
    this.name = 'video_queue_error'
  }
}

class GooglePaymentsError extends Error {
  constructor(message) {
    super(message)
    this.name = 'google_payments_error'
  }
}

class FireBaseNotificationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'firebase_notification_error'
  }
}

module.exports = {
  FileSaveError,
  FFProbeError,
  FFmpegError,
  UnknownResolutionError,
  S3UploadError,
  RedisConnectionError,
  NotificationQueueError,
  FireBaseNotificationError,
  GooglePaymentsError,
  S3RetrievalError,
  VideoQueueError,
}
