const mongoose = require("mongoose");

const userSchema = mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 4,
      maxlength: 20,
      required: true,
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      required: true,
    },
    password: { type: String, minlength: 6, select: false, required: true },
    profileName: { type: String, trim: true },
    bio: { type: String, trim: true },
    accountStatus: {
      type: String,
      enum: ["active", "disable", "banned"],
      default: "active",
    },
    isVerified: { type: Boolean, default: false },
    gender: { type: String, enum: ["male", "female"] },
    phoneNumber: { type: String, match: "/^[0-9]{10}$/" },
    refreshToken: { type: String },
    resetToken: { type: String },
    resetTokenExpires: { type: Date },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);

module.exports = User;
