const express = require("express");

const app = express();

const PORT = process.env.PORT;

app.get("/health", (req, res) => {
  res.send("Server is healthy");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
