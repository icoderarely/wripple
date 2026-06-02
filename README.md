# Wripple Backend (Node.js) 🚀

A social media backend focused on security and scalable cloud architecture. Built with Node.js and AWS to support media-heavy workloads, fast feed delivery, and real-time interaction. 🔐☁️

## Project Hook ✨

Wripple is a modern social media platform engineered for scale and safety, pairing secure API design with AWS-backed storage to handle growth without sacrificing performance.

## Tech Stack 🧰

- Node.js, Express
- MongoDB (models for users and posts)
- AWS S3 for media storage
- AWS SES for transactional email
- Multer for uploads
- Sharp for image compression (WebP)
- Socket.IO (planned) for real-time chat

## Security and Scalability Focus 🛡️

- Environment-driven secrets and configuration
- Auth middleware for protected routes
- Signed URLs for safe, time-limited media access
- Image optimization to reduce bandwidth and storage cost
- AWS-first design for elastic scaling

## Current Development Progress ✅

- API server entry point in `index.js`
- Config modules for environment, AWS S3, AWS SES, and multer
- Middleware for auth
- Models for users and posts
- Routes for users and posts
- Utility response helpers
- S3 image upload with compression and signed URL fetch

## Next Implementations 🧭

- Delete post media from S3 when a post is removed
- Cursor-based pagination for feed and list endpoints
- Like and unlike endpoints for posts
- CRUD for comments
- Real-time chat via Socket.IO

## Quick Start ⚡

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```

## Project Structure 🗂️

```
config/        Environment and third-party service configs
middlewares/   Auth and request middleware
models/        Data models
routes/        HTTP routes
utils/         Reusable helpers
```

## Notes 📝

- Image uploads are compressed to WebP before S3 upload.
- Signed URLs are used to access S3 objects.
