const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { z } = require("zod");
const router = express.Router();

const User = require("../models/user.model");
const authMiddleware = require("../middlewares/auth.middleware");
const sendEmail = require("../config/amazon-ses");

const { ok, fail } = require("../utils/response");

const validateObjectId = (paramName) => (req, res, next, value) => {
  if (!mongoose.isValidObjectId(value)) {
    return fail(res, 404, `Invalid ${paramName}.`);
  }
  return next();
};

router.param("userId", validateObjectId("user"));
router.param("requesterId", validateObjectId("requester"));

const usernameSchema = z.string().min(4).max(20);
const passwordSchema = z.string().min(6);

const registerSchema = z.object({
  username: usernameSchema,
  email: z.email(),
  password: passwordSchema,
});

const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

router.post("/register", async (req, res) => {
  const result = registerSchema.safeParse(req.body);

  if (!result.success) {
    return fail(res, 400, "Invalid request data.", {
      errors: result.error.issues,
    });
  }

  const { username, email, password } = result.data;

  const user = await User.findOne({
    $or: [{ username: username }, { email: email }],
  });

  if (user) {
    return fail(
      res,
      400,
      user.username === username
        ? "That username is already taken."
        : "That email is already registered.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = new User({
    username,
    email,
    password: passwordHash,
  });

  await newUser.save();

  const { accessToken, refreshToken } = generateTokens({
    _id: newUser._id,
    username: newUser.username,
  });

  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  newUser.refreshToken = newHashedRefreshToken;
  await newUser.save();

  setCookie(res, refreshToken);

  return ok(res, "Registration successful.", { accessToken }, 201);
});

router.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return fail(res, 400, "Invalid request data.", {
      errors: result.error.issues,
    });
  }

  const { username, password } = result.data;
  const user = await User.findOne({ username }).select("+password");
  if (!user) {
    return fail(res, 400, "Incorrect username or password.");
  }

  const isValidPass = await bcrypt.compare(password, user.password);
  if (!isValidPass) {
    return fail(res, 400, "Incorrect username or password.");
  }

  const { accessToken, refreshToken } = generateTokens({
    _id: user._id,
    username: username,
  });

  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  user.refreshToken = newHashedRefreshToken;
  await user.save();

  setCookie(res, refreshToken);

  return ok(res, "Login successful.", { accessToken });
});

router.post("/refresh", async (req, res) => {
  const userRefreshToken = req.cookies.refreshToken;
  if (!userRefreshToken) return fail(res, 401, "Refresh token is required.");

  let decodedUser;
  try {
    decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_TOKEN_KEY);
  } catch (error) {
    return fail(res, 403, "Refresh token is invalid.");
  }

  const user = await User.findById(decodedUser._id);
  if (!user) return fail(res, 404, "User not found.");

  const isValid = await bcrypt.compare(userRefreshToken, user.refreshToken);
  if (!isValid) return fail(res, 403, "Refresh token is invalid.");

  const { accessToken, refreshToken } = generateTokens({
    _id: user._id,
    username: user.username,
  });

  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  user.refreshToken = newHashedRefreshToken;
  await user.save();

  setCookie(res, refreshToken);

  return ok(res, "Access token refreshed.", { accessToken });
});

router.post("/logout", async (req, res) => {
  const userRefreshToken = req.cookies.refreshToken;
  if (!userRefreshToken) return fail(res, 401, "Refresh token is required.");

  let decodedUser;
  try {
    decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_TOKEN_KEY);
  } catch (error) {
    return fail(res, 403, "Refresh token is invalid.");
  }

  const user = await User.findById(decodedUser._id);
  if (!user) return fail(res, 404, "User not found.");

  user.refreshToken = null;
  await user.save();

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: false, // NOTE: for prod -> true
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return ok(res, "Logged out successfully.");
});

router.get("/", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return fail(res, 404, "User not found.");

  return ok(res, "User profile loaded.", user);
});

router.post("/request-password-reset", async (req, res) => {
  const result = z.object({ email: z.email() }).safeParse(req.body);
  if (!result.success) return fail(res, 400, "Invalid email address.");

  const { email } = result.data;
  let user = await User.findOne({ email: email });
  if (!user)
    return ok(
      res,
      "If an account exists for that email, a reset link will be sent.",
    );

  const resetToken = crypto.randomBytes(16).toString("hex");
  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetToken = resetTokenHash;
  user.resetTokenExpires = Date.now() + 60 * 60 * 1000;
  await user.save();

  // NOTE: sending email functionality
  const resetUrl = `https://wripple.navcodes.com/reset-password?resetToken=${resetToken}`;
  const emailSubject = "Password Reset Request for your wripple account";
  const emailBody = `Click this link to reset your password: ${resetUrl}`;
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
      <h2 style="margin: 0 0 12px;">Reset your password</h2>
      <p style="margin: 0 0 16px;">We received a request to reset your password. Click the button below to continue.</p>
      <p style="margin: 0 0 24px;">
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 18px; background: #1e2a38; color: #fff; text-decoration: none; border-radius: 6px;">Reset Password</a>
      </p>
      <p style="margin: 0 0 8px;">If the button does not work, use this link:</p>
      <p style="margin: 0 0 16px;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p style="margin: 0; color: #666; font-size: 12px;">If you did not request this, you can ignore this email.</p>
    </div>
  `;
  sendEmail(user.email, emailSubject, emailBody, emailHtml);

  return ok(
    res,
    "If an account exists for that email, a reset link will be sent.",
    { resetToken },
  );
});

router.post("/reset-password/:resetToken", async (req, res) => {
  const resetToken = req.params.resetToken;
  // const { resetToken, newPassword } = req.body;
  const result = z.object({ password: z.string().min(6) }).safeParse(req.body);
  if (!result.success) return fail(res, 400, "Password is too short.");

  const { password } = result.data;

  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const user = await User.findOne({
    resetToken: resetTokenHash,
    resetTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    return fail(res, 400, "Reset token is invalid or expired.");
  }

  // if token verified then update password
  user.password = await bcrypt.hash(password, 10);
  user.resetToken = null;
  user.resetTokenExpires = null;
  await user.save();

  return ok(res, "Password updated successfully.");
});

router.post("/:userId/follow", authMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  if (userId.toString() === currentUserId.toString())
    return fail(res, 400, "You cannot follow yourself.");

  const userToFollow = await User.findById(userId);
  if (!userToFollow) return fail(res, 404, "User not found.");

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return fail(res, 404, "User not found.");

  if (userToFollow.isPrivate) {
    if (currentUser.outgoingFollowRequests.includes(userId)) {
      return fail(res, 400, "Follow request already sent.");
    } else {
      userToFollow.incomingFollowRequests.push(currentUserId);
      currentUser.outgoingFollowRequests.push(userId);

      await userToFollow.save();
      await currentUser.save();

      return ok(res, "Follow request sent.");
    }
  } else {
    if (currentUser.following.includes(userId)) {
      return fail(res, 400, "You already follow this user.");
    } else {
      userToFollow.followers.push(currentUserId);
      currentUser.following.push(userId);

      await userToFollow.save();
      await currentUser.save();

      return ok(res, "User followed successfully.");
    }
  }
});

router.post("/:userId/unfollow", authMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  if (userId.toString() === currentUserId.toString())
    return fail(res, 400, "You cannot unfollow yourself.");

  const userToUnfollow = await User.findById(userId);
  if (!userToUnfollow) return fail(res, 404, "User not found.");

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return fail(res, 404, "User not found.");

  if (!currentUser.following.includes(userId))
    return fail(res, 400, "You dont follow them yet.");

  currentUser.following = currentUser.following.filter(
    (id) => id.toString() !== userId,
  );
  userToUnfollow.followers = userToUnfollow.followers.filter(
    (id) => id.toString() !== currentUserId.toString(),
  );

  await currentUser.save();
  await userToUnfollow.save();

  return ok(res, "Unfollowed successfully.");
});

router.get("/:userId/followers", authMiddleware, async (req, res) => {
  const userId = req.params.userId;

  const user = await User.findById(userId).populate(
    "followers",
    "_id username",
  );
  if (!user) return fail(res, 404, "User not found.");

  return ok(res, "followers list", user.followers);
});

router.get("/:userId/following", authMiddleware, async (req, res) => {
  const userId = req.params.userId;

  const user = await User.findById(userId).populate(
    "following",
    "_id username",
  );
  if (!user) return fail(res, 404, "User not found.");

  return ok(res, "following list", user.following);
});

router.post(
  "/reject-request/:requesterId",
  authMiddleware,
  async (req, res) => {
    const requesterId = req.params.requesterId;
    const userId = req.user._id.toString();

    const requester = await User.findById(requesterId);
    if (!requester) return fail(res, 404, "User not found.");

    const currentUser = await User.findById(userId);
    if (!currentUser) return fail(res, 404, "User not found.");

    if (!currentUser.incomingFollowRequests.includes(requesterId))
      return fail(res, 400, "No follow request found.");

    currentUser.incomingFollowRequests =
      currentUser.incomingFollowRequests.filter(
        (id) => id.toString() !== requesterId,
      );
    requester.outgoingFollowRequests = requester.outgoingFollowRequests.filter(
      (id) => id.toString() !== userId,
    );

    await currentUser.save();
    await requester.save();

    return ok(res, "Follow request rejected.");
  },
);

router.post(
  "/accept-request/:requesterId",
  authMiddleware,
  async (req, res) => {
    const requesterId = req.params.requesterId;
    const userId = req.user._id.toString();

    const requester = await User.findById(requesterId);
    if (!requester) return fail(res, 404, "User not found.");

    const currentUser = await User.findById(userId);
    if (!currentUser) return fail(res, 404, "User not found.");

    if (!currentUser.incomingFollowRequests.includes(requesterId))
      return fail(res, 400, "No follow request found.");

    currentUser.incomingFollowRequests =
      currentUser.incomingFollowRequests.filter(
        (id) => id.toString() !== requesterId,
      );
    requester.outgoingFollowRequests = requester.outgoingFollowRequests.filter(
      (id) => id.toString() !== userId,
    );

    currentUser.followers.push(requesterId);
    requester.following.push(userId);

    await currentUser.save();
    await requester.save();

    return ok(res, "Follow request accepted.");
  },
);

const setCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false, // NOTE: for prod -> true
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

const generateTokens = (data) => {
  const accessToken = jwt.sign(data, process.env.ACCESS_TOKEN_KEY, {
    // expiresIn: "3h"
  });
  const refreshToken = jwt.sign(data, process.env.REFRESH_TOKEN_KEY, {
    expiresIn: "30d",
  });
  return { accessToken, refreshToken };
};

module.exports = router;
