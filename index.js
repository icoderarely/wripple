require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const userRoutes = require("./routes/user.routes");
const postRoutes = require("./routes/post.routes");

const app = express();
const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.DB)
  .then(() => console.log("connected to db..."))
  .catch((err) => console.log("error connecting to db: ", err));

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use("/api/user", userRoutes);
app.use("/api/post", postRoutes);

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}...`);
});
