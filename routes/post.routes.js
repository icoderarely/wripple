const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const postUpload = require("../config/multer");
const {
  uploadImageToS3,
  fetchImageFromS3,
  deleteImageFromS3,
} = require("../config/aws-s3");
const { ok, fail } = require("../utils/response");
const Post = require("../models/post.model");
const User = require("../models/user.model");
const { getSignedImageUrl, deleteCachedImage } = require("../config/aws-cdn");
const { default: z } = require("zod");

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

router.get("/my-posts", authMiddleware, async (req, res) => {
  // pagination: /my-posts?page=2&limit=5
  const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(2),
  });
  const { page, limit } = paginationSchema.parse(req.query);

  const totalPosts = await Post.countDocuments({ user: req.user._id });

  const posts = await Post.find({ user: req.user._id }) // Find posts belonging to the logged-in user
    .sort({ createdAt: -1 }) // newest first
    .skip((page - 1) * limit) // Skip records from previous pages
    .limit(limit) // Return only 'limit' number of posts
    .lean(); // Convert Mongoose documents to plain JS objects (faster, less memory)

  const hasNextPage = page * limit < totalPosts;

  return ok(res, "My posts", { posts, page, limit, hasNextPage });
});

router.get("/following", authMiddleware, async (req, res) => {
  const paginationSchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(2),
    cursor: z.coerce.date().optional(),
  });

  const { limit, cursor } = paginationSchema.parse(req.query);

  const user = await User.findById(req.user._id).select("following");

  const query = {
    user: { $in: user.following },
  };

  // if cursor exists, fetch posts older than cursor
  if (cursor) {
    query.createdAt = { $lt: cursor };
  }

  const posts = await Post.find(query)
    .populate("user", "_id username profileName")
    .sort({ createdAt: -1 }) // newest first
    .limit(limit)
    .lean();

  const nextCursor =
    posts.length === limit ? posts[posts.length - 1].createdAt : null;

  return ok(res, "posts fetched", { posts, nextCursor });
});

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
  // const url = await fetchImageFromS3(key);

  // using cdn, and getting signed url from there
  const url = getSignedImageUrl(key);
  return ok(res, "Fetched post", url);
});

router.delete("/:postId", authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId);

    if (!post) {
      return fail(res, 404, "Post not found");
    }

    if (req.user._id.toString() !== post.user.toString()) {
      return fail(res, 403, "Unauthorized access");
    }

    await Promise.all(post.media.map((media) => deleteImageFromS3(media.key)));

    // invalidate the cloudfront cache for that image
    await Promise.all(post.media.map((media) => deleteCachedImage(media.key)));

    await post.deleteOne();

    return ok(res, "Post deleted successfully");
  } catch (error) {
    console.error(error);
    return fail(res, 500, "Internal server error");
  }
});

router.patch("/:postId/like", authMiddleware, async (req, res) => {
  const postId = req.params.postId;
  const userId = req.user._id;

  const post = await Post.findById(postId).populate("user", "followers");
  if (!post) {
    return fail(res, 404, "Post not found");
  }

  const isFollowing = post.user.followers.some(
    (id) => id.toString() === userId.toString(),
  );
  if (!isFollowing) {
    return fail(res, 403, "You don't follow this user");
  }

  const alreadyLiked = post.likes.some(
    (id) => id.toString() === userId.toString(),
  );
  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    alreadyLiked
      ? { $pull: { likes: userId } }
      : { $addToSet: { likes: userId } },
    { new: true },
  );

  return ok(res, alreadyLiked ? "Post unliked" : "Post liked", {
    likes: updatedPost.likes.length,
  });
});

module.exports = router;
