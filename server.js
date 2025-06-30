const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/database");
const authRoutes = require("./routes/auth.routes");
const videoRoutes = require("./routes/video.routes");
const communityRoutes = require("./routes/community.routes");
const cors = require("cors");
const validateEnv = require("./config/validateEnv");
const { testS3Connection } = require("./utils/connection_testing");

dotenv.config();
validateEnv();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT;

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/videos", videoRoutes);
app.use("/api/v1/community", communityRoutes);

app.get("/health", (req, res) => {
  res.send("Server is healthy");
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  try {
    await connectDB();
  } catch (err) {
    console.error(" Database connection failed:", err);
  }

  await testS3Connection();
});
