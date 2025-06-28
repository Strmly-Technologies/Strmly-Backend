const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const PORT = process.env.PORT;

app.get("/health", (req, res) => {
  res.send("Server is healthy");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
