const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    media: [
      {
        // url: {
        //   // "https://bucket.s3.amazonaws.com/posts/abc.jpg"
        //   type: String,
        //   required: true,
        // },
        key: {
          // "posts/abc.jpg"
          type: String,
          required: true,
        },
        fileName: {
          type: String,
          required: true,
        },
        mediaType: {
          type: String,
          enum: ["image", "video"],
          required: true,
        },
      },
    ],
    caption: {
      type: String,
      trim: true,
      maxlength: 2200,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    tags: [String],
    location: String,
  },
  { timestamps: true },
);

postSchema.index({ user: 1, createdAt: -1 });

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
