const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  waitUntilObjectNotExists,
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const sharp = require("sharp");

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_BUCKET_NAME,
  AWS_REGION,
} = require("./env");

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const compressImage = async (fileBuffer) => {
  return sharp(fileBuffer)
    .rotate()
    .resize({
      width: 1200,
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
};

const uploadImageToS3 = async (key, file) => {
  try {
    const isImage = file.mimetype.startsWith("image/");

    const buffer = isImage ? await compressImage(file.buffer) : file.buffer;

    const command = new PutObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: isImage ? "image/webp" : file.mimetype,
    });

    const response = await s3Client.send(command);

    return {
      key,
      etag: response.ETag,
    };
  } catch (error) {
    console.error("Amazon S3 upload error:", error);
    throw error;
  }
};

const fetchImageFromS3 = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: 600,
    });

    return url;
  } catch (error) {
    console.error("Amazon S3 fetch error:", error);
    throw error;
  }
};

const deleteImageFromS3 = async (key) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);

    return {
      success: true,
      key,
    };
  } catch (error) {
    console.error("Amazon S3 delete error:", error);
    throw error;
  }
};

module.exports = {
  uploadImageToS3,
  fetchImageFromS3,
  deleteImageFromS3,
};
