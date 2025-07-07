const { s3 } = require('../config/AWS')

const testS3Connection = async () => {
  try {
    await s3.headBucket({ Bucket: process.env.AWS_S3_BUCKET }).promise()
    console.log(' AWS S3 connected successfully')
    console.log(` Bucket: ${process.env.AWS_S3_BUCKET}`)
    return true
  } catch (error) {
    console.error(' AWS S3 connection failed:', error.message)
    if (error.code === 'NoSuchBucket') {
      console.error(` Bucket '${process.env.AWS_S3_BUCKET}' does not exist`)
    } else if (error.code === 'InvalidAccessKeyId') {
      console.error(' Invalid AWS Access Key ID')
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error(' Invalid AWS Secret Access Key')
    }
    return false
  }
}

module.exports = {
  testS3Connection,
}
