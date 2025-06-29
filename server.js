const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/database");
const authRoutes = require("./routes/auth.routes");
const videoRoutes = require("./routes/video.routes");
const cors = require('cors');
const validateEnv = require("./config/validateEnv");
const { s3 } = require("./config/AWS");

dotenv.config();
validateEnv();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT;

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/videos", videoRoutes);

app.get("/health", (req, res) => {
  res.send("Server is healthy");
});

// ADD S3 CONNECTION TEST FUNCTION
const testS3Connection = async () => {
  try {
    // Test S3 connection by checking if bucket exists
    await s3.headBucket({ Bucket: process.env.AWS_S3_BUCKET }).promise();
    console.log(" AWS S3 connected successfully");
    console.log(` Bucket: ${process.env.AWS_S3_BUCKET}`);
    return true;
  } catch (error) {
    console.error(" AWS S3 connection failed:", error.message);
    if (error.code === 'NoSuchBucket') {
      console.error(` Bucket '${process.env.AWS_S3_BUCKET}' does not exist`);
    } else if (error.code === 'InvalidAccessKeyId') {
      console.error(" Invalid AWS Access Key ID");
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error(" Invalid AWS Secret Access Key");
    }
    return false;
  }
};

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Test database connection
  try {
    await connectDB();
  } catch (err) {
    console.error(" Database connection failed:", err);
  }
  
  // Test S3 connection
  await testS3Connection();
});