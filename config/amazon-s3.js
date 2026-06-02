const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
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

// compress image
const compressImage = async (fileBuffer) => {
  const compressedBuffer = await sharp(fileBuffer)
    .rotate() // Corrects image orientation using EXIF metadata before stripping metadata and optimizing the image.
    .resize({ width: 1200, withoutEnlargement: true }) // optional
    .webp({ quality: 80 }) // adjust quality
    .toBuffer();

  return compressedBuffer;
};

const uploadImageToS3 = async (key, file) => {
  try {
    const isImage = file.mimetype.startsWith("image/");
    const buffer = isImage ? await compressImage(file.buffer) : file.buffer;
    const params = {
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: isImage ? "image/webp" : file.mimetype,
    };

    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);

    console.log("upload successfully! image id: ", response.ETag);
  } catch (error) {
    console.log("amazon s3 error:", error);
  }
};

const fetchImageFromS3 = async (key) => {
  const command = new GetObjectCommand({
    Bucket: AWS_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 600, // 10 mins
  });

  return url;
};

module.exports = { uploadImageToS3, fetchImageFromS3 };
