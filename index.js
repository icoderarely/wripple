require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const { Server } = require("socket.io");
const http = require("http");

const userRoutes = require("./routes/user.routes");
const postRoutes = require("./routes/post.routes");
const chatRoutes = require("./routes/chat.routes");

const logger = require("./config/logger");

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

mongoose
  .connect(process.env.DB)
  .then(() => {
    console.log("connected to db...");
  })
  .catch((err) => {
    logger.error("err connecting to db", err);
    logger.on("finish", () => {
      process.exit(1);
    });
    logger.end();
  });

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.use("/api/user", userRoutes);
app.use("/api/post", postRoutes);
app.use("/api/chats", chatRoutes);

// Custom error middleware
app.use((error, req, res, next) => {
  // Final error handler: log context and return a generic 500 response.
  logger.info(error);
  // NOTE: Log error in a file or in db
  logger.error(error.message, {
    method: req.method,
    path: req.originalUrl,
    stack: error.stack,
  });
  return res.status(500).json({ message: "Internal Server Error!" });
});

require("./socket/socket")(io);

server.listen(PORT, () => {
  console.log(`server running on port ${PORT}...`);
});
