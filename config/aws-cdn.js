const { getSignedUrl } = require("@aws-sdk/cloudfront-signer");
const {
  CloudFrontClient,
  CreateInvalidationCommand,
} = require("@aws-sdk/client-cloudfront");

const fs = require("fs");

const {
  CLOUDFRONT_KEY_PAIR_ID,
  CLOUDFRONT_PRIVATE_KEY_PATH,
  AWS_CDN_URL,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  CLOUDFRONT_DISTRIBUTION_ID,
} = require("./env");

const privateKey = fs.readFileSync(CLOUDFRONT_PRIVATE_KEY_PATH, "utf8");

const getSignedImageUrl = (key) => {
  return getSignedUrl({
    url: `${AWS_CDN_URL}/${key}`,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    privateKey: privateKey,
    dateLessThan: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });
};

const cloudfront = new CloudFrontClient({
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const deleteCachedImage = async (key) => {
  const params = {
    DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
    InvalidationBatch: {
      CallerReference: `${key}-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: ["/" + key],
      },
    },
  };
  const invalidationCommand = new CreateInvalidationCommand(params);

  try {
    await cloudfront.send(invalidationCommand);
  } catch (err) {
    console.error("CloudFront invalidation failed:", err);
  }
};

module.exports = { getSignedImageUrl, deleteCachedImage };
