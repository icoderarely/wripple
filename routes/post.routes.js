const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const postUpload = require("../config/multer");
const { uploadImageToS3, fetchImageFromS3 } = require("../config/amazon-s3");
const { ok, fail } = require("../utils/response");
const Post = require("../models/post.model");
const User = require("../models/user.model");

router.post(
  "/",
  authMiddleware,
  postUpload.array("media", 10),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return fail(res, 400, "At least one media file is required");
    }

    const mediaData = await Promise.all(
      req.files
        .filter((file) => file.mimetype.startsWith("image/"))
        .map(async (file) => {
          const fileName = `${randomUUID()}`;
          const mediaType = file.mimetype.startsWith("image/")
            ? "image"
            : "video";
          const key = `users/${req.user._id}/posts/${fileName}.webp`;

          await uploadImageToS3(key, file);

          return { key, fileName: `${fileName}.webp`, mediaType };
        }),
    );

    const { caption, tags, location } = req.body;

    const newPost = new Post({
      user: req.user._id,
      caption,
      tags,
      location,
      media: mediaData,
    });

    await newPost.save();

    return ok(res, "Post(s) uploaded Successfully", newPost, 201);
  },
);

router.get("/:postId", authMiddleware, async (req, res) => {
  const postId = req.params.postId;
  const postData = await Post.findById(postId).populate(
    "user",
    "_id isPrivate",
  );

  if (!postData) return fail(res, 404, "Post not found");

  const viewUser = await User.findById(req.user._id).select("following");
  if (!viewUser) {
    return fail(res, 403, "Unauthorized to access the resource.");
  }

  const isOwner = viewUser._id.toString() === postData.user._id.toString();
  const isFollowing = viewUser.following.some(
    (id) => id.toString() === postData.user._id.toString(),
  );

  if (postData.user.isPrivate && !isOwner && !isFollowing) {
    return fail(res, 403, "Unauthorized to access the resource.");
  }

  const key = postData.media[0].key;
  const url = await fetchImageFromS3(key);
  return ok(res, "Fetched post", url);
});

module.exports = router;
