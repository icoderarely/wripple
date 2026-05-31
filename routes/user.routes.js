const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const router = express.Router();

const User = require("../models/user.model");
const authMiddleware = require("../middlewares/auth.middleware");
const sendEmail = require("../config/amazon-ses");

const ok = (res, data) => res.json({ success: true, data });
const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

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
    return fail(res, 400, "invalid payload", {
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
        ? "username is already taken"
        : "email is already taken",
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

  return res.status(201).json({
    success: true,
    data: { accessToken },
  });
});

router.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return fail(res, 400, "invalid payload", {
      errors: result.error.issues,
    });
  }

  const { username, password } = result.data;
  const user = await User.findOne({ username }).select("+password");
  if (!user) {
    return fail(res, 400, "incorrect username or password");
  }

  const isValidPass = await bcrypt.compare(password, user.password);
  if (!isValidPass) {
    return fail(res, 400, "incorrect username or password");
  }

  const { accessToken, refreshToken } = generateTokens({
    _id: user._id,
    username: username,
  });

  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  user.refreshToken = newHashedRefreshToken;
  await user.save();

  setCookie(res, refreshToken);

  return ok(res, { accessToken });
});

router.post("/refresh", async (req, res) => {
  const userRefreshToken = req.cookies.refreshToken;
  if (!userRefreshToken) return fail(res, 401, "no refresh token provided");

  let decodedUser;
  try {
    decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_TOKEN_KEY);
  } catch (error) {
    return fail(res, 403, "invalid refresh token");
  }

  const user = await User.findById(decodedUser._id);
  if (!user) return fail(res, 404, "user not found");

  const isValid = await bcrypt.compare(userRefreshToken, user.refreshToken);
  if (!isValid) return fail(res, 403, "refresh token invalid");

  const { accessToken, refreshToken } = generateTokens({
    _id: user._id,
    username: username,
  });

  const newHashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  user.refreshToken = newHashedRefreshToken;
  await user.save();

  setCookie(res, refreshToken);

  return ok(res, { accessToken });
});

router.post("/logout", async (req, res) => {
  const userRefreshToken = req.cookies.refreshToken;
  if (!userRefreshToken) return fail(res, 401, "no refresh token provided");

  let decodedUser;
  try {
    decodedUser = jwt.verify(userRefreshToken, process.env.REFRESH_TOKEN_KEY);
  } catch (error) {
    return fail(res, 403, "invalid refresh token");
  }

  const user = await User.findById(decodedUser._id);
  if (!user) return fail(res, 404, "user not found");

  user.refreshToken = null;
  await user.save();

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: false, // NOTE: for prod -> true
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return ok(res, "logged out succesfully");
});

router.get("/", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return fail(res, 404, "user not found");

  return ok(res, user);
});

router.post("/request-password-reset", async (req, res) => {
  const result = z.object({ email: z.email() }).safeParse(req.body);
  if (!result.success) return fail(res, 400, "invalid email");

  const { email } = result.data;
  let user = await User.findOne({ email: email });
  if (!user) return ok(res, "email will be sent if there exist a user...");

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

  return ok(res, {
    message: "email will be sent if there exist a user",
    resetToken: resetToken,
  });
});

router.post("/reset-password/:resetToken", async (req, res) => {
  const resetToken = req.params.resetToken;
  // const { resetToken, newPassword } = req.body;
  const result = z.object({ password: z.string().min(6) }).safeParse(req.body);
  if (!result.success) return fail(res, 400, "invalid password");

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
    return fail(res, 400, "invalid or expired token");
  }

  // if token verified then update password
  user.password = await bcrypt.hash(password, 10);
  user.resetToken = null;
  user.resetTokenExpires = null;
  await user.save();

  return ok(res, "password changed");
});

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
